"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";

const NEXT: Record<string, string> = {
  NEW: "IN_PROGRESS",
  IN_PROGRESS: "READY",
  READY: "SERVED",
};

export async function advanceTicket(formData: FormData) {
  const id = String(formData.get("id"));
  const t = await db.kitchenTicket.findUnique({ where: { id } });
  if (!t) return;
  const next = NEXT[t.status];
  if (!next) return;

  await db.kitchenTicket.update({
    where: { id },
    data: {
      status: next,
      readyAt: next === "READY" ? new Date() : t.readyAt,
      servedAt: next === "SERVED" ? new Date() : t.servedAt,
    },
  });
  await logActivity({
    action: "ADVANCE",
    entity: "KOT",
    entityId: id,
    summary: `${t.kotNo} ${t.status} → ${next}`,
    outletId: t.outletId,
  });
  revalidatePath("/kds");
  revalidatePath("/orders/kot");
  revalidatePath("/logs");
}

export async function cancelTicket(formData: FormData) {
  const id = String(formData.get("id"));
  const t = await db.kitchenTicket.findUnique({ where: { id } });
  if (!t) return;
  await db.kitchenTicket.update({ where: { id }, data: { status: "CANCELLED" } });
  await logActivity({
    action: "CANCEL",
    entity: "KOT",
    entityId: id,
    summary: `Cancelled ${t.kotNo}`,
    outletId: t.outletId,
  });
  revalidatePath("/kds");
  revalidatePath("/orders/kot");
  revalidatePath("/logs");
}

export async function reopenTicket(formData: FormData) {
  const id = String(formData.get("id"));
  await db.kitchenTicket.update({
    where: { id },
    data: { status: "NEW", readyAt: null, servedAt: null },
  });
  revalidatePath("/kds");
}
