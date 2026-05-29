"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";

const TableInput = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  area: z.string().min(1),
  capacity: z.coerce.number().int().min(1).max(50),
  posX: z.coerce.number().min(0).max(100),
  posY: z.coerce.number().min(0).max(100),
  shape: z.enum(["ROUND", "SQUARE", "RECT"]).default("ROUND"),
  active: z.coerce.boolean().default(true),
});

export async function saveTable(fd: FormData) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const p = TableInput.parse({
    id: fd.get("id") || undefined,
    name: fd.get("name"),
    area: fd.get("area") || "Main",
    capacity: fd.get("capacity"),
    posX: fd.get("posX") ?? 50,
    posY: fd.get("posY") ?? 50,
    shape: fd.get("shape") || "ROUND",
    active: fd.get("active") === "false" ? false : true,
  });

  if (p.id) {
    await db.diningTable.update({ where: { id: p.id }, data: { ...p, id: undefined } });
  } else {
    await db.diningTable.create({ data: { ...p, id: undefined, outletId: outlet.id } });
  }
  revalidatePath("/settings/floor-plan");
  revalidatePath("/orders/live");
  revalidatePath("/billing");
}

const BulkPositionInput = z.object({
  positions: z.string(), // JSON: [{ id, posX, posY }]
});

/** Persist all dragged positions in one shot from the editor canvas. */
export async function saveTablePositions(fd: FormData) {
  await requireUser("MANAGER");
  const { positions } = BulkPositionInput.parse({ positions: fd.get("positions") });
  const arr = JSON.parse(positions) as { id: string; posX: number; posY: number }[];
  for (const row of arr) {
    await db.diningTable.update({
      where: { id: row.id },
      data: { posX: row.posX, posY: row.posY },
    });
  }
  revalidatePath("/settings/floor-plan");
  revalidatePath("/orders/live");
  revalidatePath("/billing");
}

export async function deleteTable(fd: FormData) {
  await requireUser("MANAGER");
  const id = String(fd.get("id") || "");
  if (!id) return;
  // Soft delete — keep historical orders working but hide from the grid.
  await db.diningTable.update({ where: { id }, data: { active: false } });
  revalidatePath("/settings/floor-plan");
  revalidatePath("/orders/live");
  revalidatePath("/billing");
}
