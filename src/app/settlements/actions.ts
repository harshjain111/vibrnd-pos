"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { logActivity } from "@/lib/audit";
import { inr } from "@/lib/utils";

const Settle = z.object({
  orderId: z.string(),
  paymentMode: z.enum(["CASH", "UPI", "CARD", "ONLINE", "WALLET"]),
  amount: z.coerce.number().positive(),
  note: z.string().optional(),
});

export async function settleDue(fd: FormData) {
  await requireUser("MANAGER");
  const user = await getSessionUser();
  const parsed = Settle.parse({
    orderId: fd.get("orderId"),
    paymentMode: fd.get("paymentMode"),
    amount: fd.get("amount"),
    note: fd.get("note") || undefined,
  });

  const order = await db.order.findUnique({ where: { id: parsed.orderId } });
  if (!order) throw new Error("Order not found");
  if (order.status === "CANCELLED") throw new Error("Cancelled orders can't be settled");
  if (order.closedAt) throw new Error("Order already fully settled");

  const balance = order.grandTotal - order.amountPaid;
  if (balance <= 0.001) throw new Error("Nothing to settle — order is already paid");
  if (parsed.amount > balance + 0.01) {
    throw new Error(`Amount ${inr(parsed.amount)} exceeds balance ${inr(balance)}`);
  }

  const newPaid = order.amountPaid + parsed.amount;
  const remaining = order.grandTotal - newPaid;
  const fullSettlement = remaining < 0.01;

  // Persist the receipt
  await db.payment.create({
    data: {
      orderId: order.id,
      outletId: order.outletId,
      amount: parsed.amount,
      mode: parsed.paymentMode,
      note: parsed.note,
      actor: user?.email ?? "system",
    },
  });

  await db.order.update({
    where: { id: parsed.orderId },
    data: {
      amountPaid: newPaid,
      paymentMode: parsed.paymentMode, // last mode used (summary)
      status: fullSettlement ? "PAID" : order.status,
      closedAt: fullSettlement ? new Date() : null,
    },
  });

  if (parsed.paymentMode === "CASH") {
    await db.cashEntry.create({
      data: {
        kind: "TOP_UP",
        amount: parsed.amount,
        reason: `Settled ${order.invoiceNo}${fullSettlement ? "" : " (partial)"}`,
        actor: user?.email ?? "system",
        outletId: order.outletId,
      },
    });
  }

  await logActivity({
    action: "SETTLE",
    entity: "Order",
    entityId: order.id,
    summary: `${fullSettlement ? "Settled" : "Part-paid"} ${order.invoiceNo} — ${inr(parsed.amount)} via ${parsed.paymentMode}${
      fullSettlement ? "" : ` · balance now ${inr(remaining)}`
    }${parsed.note ? ` · ${parsed.note}` : ""}`,
    outletId: order.outletId,
  });

  revalidatePath("/settlements");
  revalidatePath("/orders");
  revalidatePath("/orders/live");
  revalidatePath(`/orders/${order.id}`);
  revalidatePath("/logs");
  revalidatePath("/cash");
  revalidatePath("/day-end");
}
