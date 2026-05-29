"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { moveStock } from "@/lib/stock";
import { logActivity } from "@/lib/audit";
import { getActiveOutlet } from "@/lib/outlet";

const W = z.object({
  rawMaterialId: z.string(),
  qty: z.coerce.number().positive(),
  reason: z.string().min(1).max(64),
  note: z.string().optional(),
});

export async function recordWastage(fd: FormData) {
  const outlet = await getActiveOutlet();
  const parsed = W.parse({
    rawMaterialId: fd.get("rawMaterialId"),
    qty: fd.get("qty"),
    reason: fd.get("reason"),
    note: fd.get("note") || undefined,
  });
  const rm = await db.rawMaterial.findUnique({ where: { id: parsed.rawMaterialId } });
  if (!rm) return;

  await moveStock({
    rawMaterialId: rm.id,
    delta: -parsed.qty,
    reason: "WASTAGE",
    refType: "Manual",
    note: `${parsed.reason}${parsed.note ? ` · ${parsed.note}` : ""}`,
  });

  await logActivity({
    action: "DELETE",
    entity: "RawMaterial",
    entityId: rm.id,
    summary: `Wastage ${parsed.qty}${rm.unit} of ${rm.name} (${parsed.reason})`,
    outletId: outlet.id,
  });

  revalidatePath("/inventory");
  revalidatePath("/inventory/wastage");
  revalidatePath("/inventory/movements");
  revalidatePath("/logs");
}
