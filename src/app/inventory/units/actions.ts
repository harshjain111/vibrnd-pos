"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireInventoryOps } from "@/lib/rbac";

const U = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(20),
  baseUnit: z.string().optional(),
  conversionFactor: z.coerce.number().positive().default(1),
});

export async function saveUnit(fd: FormData) {
  await requireInventoryOps();
  const outlet = await getActiveOutlet();
  const p = U.parse({
    id: fd.get("id") || undefined,
    name: String(fd.get("name") || "").trim(),
    baseUnit: fd.get("baseUnit") || undefined,
    conversionFactor: fd.get("conversionFactor") || 1,
  });
  if (p.id) {
    await db.unit.update({
      where: { id: p.id },
      data: { name: p.name, baseUnit: p.baseUnit, conversionFactor: p.conversionFactor },
    });
  } else {
    await db.unit.create({
      data: { ...p, id: undefined, outletId: outlet.id },
    });
  }
  revalidatePath("/inventory/units");
}

export async function deleteUnit(fd: FormData) {
  await requireInventoryOps();
  const id = String(fd.get("id") || "");
  if (!id) return;
  await db.unit.delete({ where: { id } });
  revalidatePath("/inventory/units");
}

/** Seed the 21 default units the spec calls for (idempotent — skips existing names). */
export async function seedDefaultUnits() {
  await requireInventoryOps();
  const outlet = await getActiveOutlet();
  const defaults = [
    "kg", "g", "ltr", "ml", "pcs", "dozen",
    "BOX", "BAG", "BULK", "Btls", "TIN", "Can",
    "Qty", "Bun", "Pkt", "Roll", "Sheet", "Set",
    "Tray", "Plate", "Strip",
  ];
  for (const name of defaults) {
    await db.unit.upsert({
      where: { outletId_name: { outletId: outlet.id, name } },
      update: {},
      create: { name, outletId: outlet.id, conversionFactor: 1 },
    });
  }
  revalidatePath("/inventory/units");
}
