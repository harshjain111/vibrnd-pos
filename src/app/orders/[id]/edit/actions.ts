"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { moveStock } from "@/lib/stock";
import { logActivity } from "@/lib/audit";
import { inr } from "@/lib/utils";

const AddonShape = z.object({ name: z.string(), priceDelta: z.number() });

const AddLineInput = z.object({
  orderId: z.string(),
  reason: z.string().min(3),
  lines: z
    .array(
      z.object({
        itemId: z.string(),
        qty: z.number().int().positive(),
        unitPrice: z.number().nonnegative(),
        variantName: z.string().optional(),
        addons: z.array(AddonShape).default([]),
      })
    )
    .min(1),
});

export async function appendLines(input: z.infer<typeof AddLineInput>) {
  await requireUser("MANAGER");
  const data = AddLineInput.parse(input);
  const order = await db.order.findUnique({
    where: { id: data.orderId },
    include: { items: true, outlet: true },
  });
  if (!order) throw new Error("Order not found");
  if (order.status === "CANCELLED") throw new Error("Cancelled orders can't be modified");

  const items = await db.item.findMany({
    where: { id: { in: data.lines.map((l) => l.itemId) }, outletId: order.outletId },
  });
  const itemMap = new Map(items.map((i) => [i.id, i]));

  // Recompute totals: existing snapshot + new lines, honoring outlet.taxInclusive
  let sub = order.subTotal;
  let tax = order.taxTotal;
  for (const l of data.lines) {
    const it = itemMap.get(l.itemId);
    if (!it) throw new Error(`Item ${l.itemId} not found`);
    const lineTotal = l.unitPrice * l.qty;
    const rate = it.taxRate / 100;
    if (order.outlet.taxInclusive) {
      const base = lineTotal / (1 + rate);
      sub += base;
      tax += lineTotal - base;
    } else {
      sub += lineTotal;
      tax += lineTotal * rate;
    }
  }
  const grand = Math.round(sub + tax - order.discount + order.tip);

  // Persist new lines
  for (const l of data.lines) {
    const it = itemMap.get(l.itemId)!;
    const displayName = l.variantName ? `${it.name} (${l.variantName})` : it.name;
    await db.orderItem.create({
      data: {
        orderId: order.id,
        itemId: it.id,
        name: displayName,
        price: l.unitPrice,
        qty: l.qty,
        taxRate: it.taxRate,
        variantName: l.variantName,
        addonsJson: l.addons.length ? JSON.stringify(l.addons) : null,
      },
    });
  }

  await db.order.update({
    where: { id: order.id },
    data: { subTotal: sub, taxTotal: tax, grandTotal: grand, amendedAt: new Date() },
  });

  // KOT for the new lines
  const kotCount = await db.kitchenTicket.count({ where: { outletId: order.outletId } });
  await db.kitchenTicket.create({
    data: {
      kotNo: `KOT-${String(kotCount + 1).padStart(6, "0")}`,
      orderId: order.id,
      outletId: order.outletId,
      status: "NEW",
      notes: `AMENDMENT · ${data.reason}`,
      lines: {
        create: data.lines.map((l) => {
          const it = itemMap.get(l.itemId)!;
          const note = [l.variantName, ...l.addons.map((a) => `+ ${a.name}`)].filter(Boolean).join(" · ");
          return { itemId: it.id, name: it.name, qty: l.qty, note: note || undefined };
        }),
      },
    },
  });

  // Stock consumption for added lines
  for (const l of data.lines) {
    const recipe = await db.recipe.findUnique({
      where: { itemId: l.itemId },
      include: { ingredients: true },
    });
    if (!recipe) continue;
    for (const ing of recipe.ingredients) {
      await moveStock({
        rawMaterialId: ing.rawMaterialId,
        delta: -(ing.qty * l.qty),
        reason: "SALE",
        refType: "Order",
        refId: order.id,
        note: `Amend ${order.invoiceNo} · ${itemMap.get(l.itemId)?.name} ×${l.qty}`,
      });
    }
  }

  const itemSummary = data.lines.map((l) => `${itemMap.get(l.itemId)?.name} ×${l.qty}`).join(", ");
  await logActivity({
    action: "UPDATE",
    entity: "Order",
    entityId: order.id,
    summary: `Amended ${order.invoiceNo} (+${itemSummary}) → new total ${inr(grand)} · reason: ${data.reason}`,
    outletId: order.outletId,
  });

  revalidatePath(`/orders/${order.id}`);
  revalidatePath("/orders");
  revalidatePath("/orders/live");
  revalidatePath("/kds");
  revalidatePath("/logs");
  redirect(`/orders/${order.id}`);
}

const RemoveInput = z.object({
  orderId: z.string(),
  orderItemId: z.string(),
  reason: z.string().min(3),
});

export async function removeLine(input: z.infer<typeof RemoveInput>) {
  await requireUser("MANAGER");
  const { orderId, orderItemId, reason } = RemoveInput.parse(input);

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { outlet: true },
  });
  if (!order) throw new Error("Order not found");
  if (order.status === "CANCELLED") throw new Error("Cancelled orders can't be modified");

  const line = await db.orderItem.findUnique({ where: { id: orderItemId } });
  if (!line || line.orderId !== orderId) throw new Error("Line not found");

  // Reverse stock for this line
  const recipe = await db.recipe.findUnique({
    where: { itemId: line.itemId },
    include: { ingredients: true },
  });
  if (recipe) {
    for (const ing of recipe.ingredients) {
      await moveStock({
        rawMaterialId: ing.rawMaterialId,
        delta: ing.qty * line.qty,
        reason: "CANCEL_REVERSE",
        refType: "Order",
        refId: order.id,
        note: `Remove line from ${order.invoiceNo} · ${line.name}`,
      });
    }
  }

  // Recompute totals minus this line
  const lineTotal = line.price * line.qty;
  const rate = line.taxRate / 100;
  let subDec = lineTotal;
  let taxDec = lineTotal * rate;
  if (order.outlet.taxInclusive) {
    subDec = lineTotal / (1 + rate);
    taxDec = lineTotal - subDec;
  }
  const newSub = Math.max(0, order.subTotal - subDec);
  const newTax = Math.max(0, order.taxTotal - taxDec);
  const newGrand = Math.max(0, Math.round(newSub + newTax - order.discount + order.tip));

  await db.orderItem.delete({ where: { id: orderItemId } });
  await db.order.update({
    where: { id: order.id },
    data: { subTotal: newSub, taxTotal: newTax, grandTotal: newGrand, amendedAt: new Date() },
  });

  await logActivity({
    action: "UPDATE",
    entity: "Order",
    entityId: order.id,
    summary: `Removed ${line.name} ×${line.qty} from ${order.invoiceNo} → new total ${inr(newGrand)} · reason: ${reason}`,
    outletId: order.outletId,
  });

  revalidatePath(`/orders/${order.id}`);
  revalidatePath(`/orders/${order.id}/edit`);
  revalidatePath("/orders");
  revalidatePath("/logs");
}
