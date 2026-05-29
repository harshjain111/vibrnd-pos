"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { createNotification } from "@/lib/notify";

const NEXT: Record<string, string> = {
  PLACED: "ACCEPTED",
  ACCEPTED: "FOOD_READY",
  FOOD_READY: "PICKED_UP",
  PICKED_UP: "DELIVERED",
};

export async function advanceOnlineOrder(fd: FormData) {
  const id = String(fd.get("id"));
  const o = await db.order.findUnique({ where: { id }, include: { outlet: true } });
  if (!o) return;
  const next = NEXT[o.status];
  if (!next) return;
  // Gate: store closed → can't accept new orders
  if (o.status === "PLACED" && next === "ACCEPTED" && !o.outlet.storeOpen) {
    throw new Error("Store is closed — reopen it before accepting orders");
  }

  await db.order.update({
    where: { id },
    data: {
      status: next,
      closedAt: next === "DELIVERED" ? new Date() : null,
    },
  });

  // Auto-create KOT when accepting
  if (next === "ACCEPTED") {
    const existing = await db.kitchenTicket.findFirst({ where: { orderId: id } });
    if (!existing) {
      const items = await db.orderItem.findMany({ where: { orderId: id } });
      const kotCount = await db.kitchenTicket.count();
      await db.kitchenTicket.create({
        data: {
          kotNo: `KOT-${String(kotCount + 1).padStart(6, "0")}`,
          orderId: id,
          outletId: o.outletId,
          status: "NEW",
          lines: {
            create: items.map((li) => ({ itemId: li.itemId, name: li.name, qty: li.qty })),
          },
        },
      });
    }
  }

  await logActivity({
    action: next === "ACCEPTED" ? "ACCEPT" : "ADVANCE",
    entity: "Order",
    entityId: id,
    summary: `${o.channel} order ${o.aggregatorOrderId ?? o.invoiceNo} → ${next}`,
    outletId: o.outletId,
  });

  revalidatePath("/orders/online");
  revalidatePath("/kds");
  revalidatePath("/orders/live");
  revalidatePath("/logs");
}

export async function rejectOnlineOrder(fd: FormData) {
  const id = String(fd.get("id"));
  const o = await db.order.findUnique({ where: { id } });
  if (!o) return;
  await db.order.update({
    where: { id },
    data: { status: "REJECTED", closedAt: new Date() },
  });
  await logActivity({
    action: "REJECT",
    entity: "Order",
    entityId: id,
    summary: `Rejected ${o.channel} order ${o.aggregatorOrderId ?? o.invoiceNo}`,
    outletId: o.outletId,
  });
  revalidatePath("/orders/online");
  revalidatePath("/logs");
}
