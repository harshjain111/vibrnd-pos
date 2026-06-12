"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { moveStock, applyRecipeStock } from "@/lib/stock";
import { logActivity } from "@/lib/audit";
import { getSessionUser } from "@/lib/session";
import { inr } from "@/lib/utils";

const ReturnInput = z.object({
  orderId: z.string(),
  reason: z.string().min(3),
  refundMode: z.enum(["CASH", "UPI", "CARD", "WALLET", "GIFT_CARD"]),
  lines: z
    .array(
      z.object({
        orderItemId: z.string(),
        qty: z.coerce.number().int().positive(),
      })
    )
    .min(1),
});

export async function processReturn(input: z.infer<typeof ReturnInput>) {
  await requireUser("MANAGER");
  const data = ReturnInput.parse(input);
  const user = await getSessionUser();

  const order = await db.order.findUnique({
    where: { id: data.orderId },
    include: { items: true, outlet: true },
  });
  if (!order) throw new Error("Order not found");
  if (order.status === "CANCELLED") throw new Error("Cancelled orders can't be returned");

  // Resolve the line snapshots
  const lineMap = new Map(order.items.map((i) => [i.id, i]));
  const returns = data.lines.map((l) => {
    const item = lineMap.get(l.orderItemId);
    if (!item) throw new Error(`Order item ${l.orderItemId} not found`);
    if (l.qty > item.qty) throw new Error(`Return qty exceeds ordered qty for ${item.name}`);
    return { item, qty: l.qty };
  });

  const amount = Math.round(returns.reduce((s, r) => s + r.item.price * r.qty, 0));

  // SalesReturn.returnNo is @unique globally — namespace by outlet code +
  // small retry loop. Same fix pattern as PO / invoice / KOT numbers.
  const outletForCode = await db.outlet.findUnique({ where: { id: order.outletId }, select: { code: true } });
  const outletCode = outletForCode?.code ?? "X";
  let returnNo = "";
  {
    const count = await db.salesReturn.count({ where: { outletId: order.outletId } });
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `RET-${outletCode}-${String(count + 1 + attempt).padStart(6, "0")}`;
      const clash = await db.salesReturn.findUnique({ where: { returnNo: candidate } });
      if (!clash) {
        returnNo = candidate;
        break;
      }
    }
    if (!returnNo) throw new Error("Could not allocate a return number");
  }

  const ret = await db.salesReturn.create({
    data: {
      returnNo,
      orderId: order.id,
      outletId: order.outletId,
      reason: data.reason,
      refundMode: data.refundMode,
      amount,
      actor: user?.email ?? "system",
      lines: {
        create: returns.map((r) => ({
          orderItemId: r.item.id,
          name: r.item.name,
          qty: r.qty,
          unitPrice: r.item.price,
          lineTotal: r.item.price * r.qty,
        })),
      },
    },
  });

  // Reverse stock per recipe for returned qty — variant + addon aware.
  for (const r of returns) {
    const addons: { name: string }[] = r.item.addonsJson
      ? (() => {
          try {
            return JSON.parse(r.item.addonsJson) as { name: string }[];
          } catch {
            return [];
          }
        })()
      : [];
    await applyRecipeStock({
      itemId: r.item.itemId,
      variantName: r.item.variantName ?? null,
      qty: r.qty,
      addons,
      refId: ret.id,
      refType: "SalesReturn",
      reverse: true,
      note: `${returnNo} ← ${order.invoiceNo} · ${r.item.name} ×${r.qty}`,
    });
  }

  await logActivity({
    action: "UPDATE",
    entity: "Order",
    entityId: order.id,
    summary: `Sales return ${returnNo} from ${order.invoiceNo} — ${inr(amount)} refunded ${data.refundMode} · ${data.reason}`,
    outletId: order.outletId,
  });

  revalidatePath(`/orders/${order.id}`);
  revalidatePath(`/orders/${order.id}/return`);
  revalidatePath("/orders");
  revalidatePath("/logs");
  redirect(`/orders/${order.id}`);
}
