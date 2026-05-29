"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { logActivity } from "@/lib/audit";
import { inr } from "@/lib/utils";

const R = z.object({
  orderId: z.string(),
  reconciledAmount: z.coerce.number().nonnegative(),
  note: z.string().optional(),
});

export async function reconcileOrder(fd: FormData) {
  await requireUser("MANAGER");
  const parsed = R.parse({
    orderId: fd.get("orderId"),
    reconciledAmount: fd.get("reconciledAmount"),
    note: fd.get("note") || undefined,
  });
  const order = await db.order.findUnique({ where: { id: parsed.orderId } });
  if (!order) throw new Error("Order not found");

  await db.order.update({
    where: { id: parsed.orderId },
    data: {
      reconciledAt: new Date(),
      reconciledAmount: parsed.reconciledAmount,
    },
  });

  const diff = parsed.reconciledAmount - order.grandTotal;
  await logActivity({
    action: "UPDATE",
    entity: "Order",
    entityId: order.id,
    summary: `Reconciled ${order.invoiceNo} (${order.channel}): aggregator paid ${inr(parsed.reconciledAmount)} vs POS ${inr(order.grandTotal)} (Δ ${inr(diff)})${parsed.note ? ` · ${parsed.note}` : ""}`,
    outletId: order.outletId,
  });

  revalidatePath("/reconciliation");
  revalidatePath("/logs");
}
