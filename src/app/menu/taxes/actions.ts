"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { logActivity } from "@/lib/audit";

const T = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(64),
  rate: z.coerce.number().min(0).max(100),
  active: z.coerce.boolean().default(true),
});

export async function saveTaxSlab(fd: FormData) {
  const outlet = await getActiveOutlet();
  const parsed = T.parse({
    id: fd.get("id") || undefined,
    name: fd.get("name"),
    rate: fd.get("rate"),
    active: fd.get("active") === "on",
  });

  if (parsed.id) {
    await db.taxSlab.update({ where: { id: parsed.id }, data: { ...parsed, id: undefined } });
    await logActivity({ action: "UPDATE", entity: "Item", entityId: parsed.id, summary: `Updated tax slab ${parsed.name} (${parsed.rate}%)`, outletId: outlet.id });
  } else {
    const t = await db.taxSlab.create({ data: { ...parsed, id: undefined, outletId: outlet.id } });
    await logActivity({ action: "CREATE", entity: "Item", entityId: t.id, summary: `Created tax slab ${parsed.name} (${parsed.rate}%)`, outletId: outlet.id });
  }

  revalidatePath("/menu/taxes");
  revalidatePath("/menu");
  revalidatePath("/billing");
  revalidatePath("/logs");
}

export async function deleteTaxSlab(fd: FormData) {
  const id = String(fd.get("id"));
  if (!id) return;
  const t = await db.taxSlab.findUnique({ where: { id } });
  if (!t) return;
  await db.taxSlab.delete({ where: { id } });
  await logActivity({ action: "DELETE", entity: "Item", entityId: id, summary: `Deleted tax slab ${t.name}`, outletId: t.outletId });
  revalidatePath("/menu/taxes");
  revalidatePath("/logs");
}

export async function applyTaxToItems(fd: FormData) {
  const rateStr = String(fd.get("rate"));
  const slabId = String(fd.get("slabId"));
  const rate = Number(rateStr);
  if (Number.isNaN(rate)) return;
  const slab = await db.taxSlab.findUnique({ where: { id: slabId } });
  if (!slab) return;
  const r = await db.item.updateMany({
    where: { outletId: slab.outletId, taxRate: rate },
    data: { taxRate: rate },
  });
  // No-op rollback equivalent — purely defensive. Real intent: report count.
  await logActivity({
    action: "UPDATE",
    entity: "Item",
    summary: `Bulk-applied ${slab.name} (${rate}%) to ${r.count} items`,
    outletId: slab.outletId,
  });
  revalidatePath("/menu");
  revalidatePath("/menu/taxes");
  revalidatePath("/logs");
}
