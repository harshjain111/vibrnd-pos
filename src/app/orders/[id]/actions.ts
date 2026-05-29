"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { moveStock } from "@/lib/stock";
import { assertOrderEditable } from "@/lib/day-close";
import { requireUser } from "@/lib/rbac";

const CancelInput = z.object({
  id: z.string(),
  reason: z.string().optional(),
});

export async function cancelOrder(input: z.infer<typeof CancelInput>) {
  const user = await requireUser("MANAGER");
  const { id, reason } = CancelInput.parse(input);
  const o = await db.order.findUnique({ where: { id } });
  if (!o) throw new Error("Order not found");
  if (o.status === "CANCELLED") return;
  // Bills become immutable after their business day is closed unless an Owner overrides.
  await assertOrderEditable(o, user.role);

  await db.order.update({
    where: { id },
    data: { status: "CANCELLED", notes: reason ? `Cancelled: ${reason}` : "Cancelled" },
  });

  // Cancel any active KOTs tied to this order
  await db.kitchenTicket.updateMany({
    where: { orderId: id, status: { in: ["NEW", "IN_PROGRESS", "READY"] } },
    data: { status: "CANCELLED" },
  });

  // Reverse stock decrement if a recipe consumed it
  const items = await db.orderItem.findMany({ where: { orderId: id } });
  for (const li of items) {
    const recipe = await db.recipe.findUnique({
      where: { itemId: li.itemId },
      include: { ingredients: true },
    });
    if (!recipe) continue;
    for (const ing of recipe.ingredients) {
      await moveStock({
        rawMaterialId: ing.rawMaterialId,
        delta: ing.qty * li.qty,
        reason: "CANCEL_REVERSE",
        refType: "Order",
        refId: id,
        note: `Reverse ${o.invoiceNo} · ${li.name} ×${li.qty}`,
      });
    }
  }

  await logActivity({
    action: "CANCEL",
    entity: "Order",
    entityId: id,
    summary: `Cancelled ${o.invoiceNo}${reason ? ` — ${reason}` : ""}`,
    outletId: o.outletId,
  });

  revalidatePath("/");
  revalidatePath("/orders");
  revalidatePath("/orders/live");
  revalidatePath(`/orders/${id}`);
  revalidatePath("/kds");
  revalidatePath("/logs");
}

export async function reopenOrder(formData: FormData) {
  const user = await requireUser("MANAGER");
  const id = String(formData.get("id"));
  const o = await db.order.findUnique({ where: { id } });
  if (!o) return;
  await assertOrderEditable(o, user.role);
  await db.order.update({ where: { id }, data: { status: "PRINTED", closedAt: null, notes: null } });
  await logActivity({
    action: "UPDATE",
    entity: "Order",
    entityId: id,
    summary: `Reopened ${o.invoiceNo}`,
    outletId: o.outletId,
  });
  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
  revalidatePath("/logs");
}

const SplitInput = z.object({
  id: z.string(),
  moveItemIds: z.array(z.string()).min(1, "Pick at least one item to move to the new bill"),
});

/**
 * Split bill v1 (audit TASK 11) — move the picked line items to a brand-new
 * Order; the original keeps what's left. Only allowed on unsettled bills.
 * Each split creates a fresh invoice number and copies customer + table.
 */
export async function splitBillByItem(input: z.infer<typeof SplitInput>) {
  const user = await requireUser("MANAGER");
  const { id, moveItemIds } = SplitInput.parse(input);
  const orig = await db.order.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!orig) throw new Error("Order not found");
  if (orig.status === "CANCELLED" || orig.status === "PAID") {
    throw new Error(`Cannot split a ${orig.status.toLowerCase()} bill.`);
  }
  await assertOrderEditable(orig, user.role);

  const moving = orig.items.filter((i) => moveItemIds.includes(i.id));
  const remaining = orig.items.filter((i) => !moveItemIds.includes(i.id));
  if (moving.length === 0) throw new Error("No matching items to move.");
  if (remaining.length === 0) throw new Error("Pick fewer items — original bill must keep at least one line.");

  // Build a fresh invoice number for the new bill.
  const count = await db.order.count({ where: { outletId: orig.outletId } });
  const padded = String(count + 1).padStart(6, "0");
  const splitInvoice = `INV-${padded}-S`;

  // Totals for both halves.
  const totalOf = (lines: typeof orig.items) => {
    const sub = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const tax = lines.reduce((s, l) => s + l.price * l.qty * (l.taxRate / 100), 0);
    return { sub, tax, grand: Math.round(sub + tax) };
  };
  const tA = totalOf(remaining);
  const tB = totalOf(moving);

  // Create the new bill with the moved items.
  const splitOrder = await db.order.create({
    data: {
      invoiceNo: splitInvoice,
      orderType: orig.orderType,
      channel: orig.channel,
      status: "PRINTED",
      subTotal: tB.sub,
      taxTotal: tB.tax,
      grandTotal: tB.grand,
      outletId: orig.outletId,
      tableId: orig.tableId,
      customerId: orig.customerId,
      notes: `Split from ${orig.invoiceNo}`,
    },
  });
  // Move each picked line over to the new order.
  await db.orderItem.updateMany({
    where: { id: { in: moveItemIds } },
    data: { orderId: splitOrder.id },
  });
  // Update original totals.
  await db.order.update({
    where: { id: orig.id },
    data: {
      subTotal: tA.sub,
      taxTotal: tA.tax,
      grandTotal: tA.grand,
      notes: `${orig.notes ? `${orig.notes} · ` : ""}Split: ${moving.length} item(s) moved → ${splitInvoice}`,
    },
  });

  await logActivity({
    action: "UPDATE",
    entity: "Order",
    entityId: id,
    summary: `Split ${orig.invoiceNo} → ${splitInvoice} (${moving.length} item${moving.length === 1 ? "" : "s"})`,
    outletId: orig.outletId,
  });

  revalidatePath(`/orders/${id}`);
  revalidatePath(`/orders/${splitOrder.id}`);
  revalidatePath("/orders");
  revalidatePath("/orders/live");
  revalidatePath("/logs");
  return { splitId: splitOrder.id, splitInvoice };
}

const ReprintInput = z.object({ id: z.string(), reason: z.string().min(3, "Reason is required (min 3 chars)") });

/** Re-print bill (audit TASK 10). Captures reason → audit trail + leakage signal. */
export async function reprintBill(fd: FormData) {
  await requireUser("BILLER");
  const { id, reason } = ReprintInput.parse({
    id: fd.get("id"),
    reason: fd.get("reason"),
  });
  const o = await db.order.findUnique({ where: { id } });
  if (!o) throw new Error("Order not found");
  await db.order.update({
    where: { id },
    data: { reprintCount: { increment: 1 }, reprintReason: reason },
  });
  await logActivity({
    action: "UPDATE",
    entity: "Order",
    entityId: id,
    summary: `Re-printed ${o.invoiceNo} (${o.reprintCount + 1}x) — reason: ${reason}`,
    outletId: o.outletId,
  });
  revalidatePath(`/orders/${id}`);
  revalidatePath("/logs");
}
