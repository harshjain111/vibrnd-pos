"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { moveStock } from "@/lib/stock";
import { logActivity } from "@/lib/audit";

const Adj = z.object({
  rawMaterialId: z.string(),
  newQty: z.coerce.number().nonnegative(),
  comments: z.string().optional(),
});

/**
 * Set the available qty of a raw material to a new absolute value.
 * Writes a stock_movement with reason ADJUST and the delta needed to reach newQty.
 */
export async function updateAvailable(fd: FormData) {
  await requireUser("BILLER");
  const outlet = await getActiveOutlet();
  const p = Adj.parse({
    rawMaterialId: fd.get("rawMaterialId"),
    newQty: fd.get("newQty"),
    comments: fd.get("comments") || undefined,
  });
  const rm = await db.rawMaterial.findUnique({ where: { id: p.rawMaterialId } });
  if (!rm || rm.outletId !== outlet.id) throw new Error("Raw material not found");
  const delta = p.newQty - rm.currentQty;
  if (delta === 0) return;
  await moveStock({
    rawMaterialId: p.rawMaterialId,
    delta,
    reason: "ADJUST",
    refType: "AvailableStock",
    note: p.comments || `Available-stock edit · ${rm.currentQty} → ${p.newQty}`,
  });
  await logActivity({
    action: "UPDATE",
    entity: "RawMaterial",
    entityId: rm.id,
    summary: `${rm.name} ${rm.currentQty} → ${p.newQty} ${rm.unit}${p.comments ? ` · ${p.comments}` : ""}`,
    outletId: outlet.id,
  });
  revalidatePath("/inventory/available");
  revalidatePath("/inventory");
  revalidatePath("/inventory/movements");
}

export async function toggleFavourite(fd: FormData) {
  await requireUser("BILLER");
  const id = String(fd.get("id") || "");
  if (!id) return;
  const rm = await db.rawMaterial.findUnique({ where: { id } });
  if (!rm) return;
  await db.rawMaterial.update({ where: { id }, data: { isFavourite: !rm.isFavourite } });
  revalidatePath("/inventory/available");
}
