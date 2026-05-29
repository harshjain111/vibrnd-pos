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
