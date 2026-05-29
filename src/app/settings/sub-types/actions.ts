"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";

const S = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(40),
  parentType: z.enum(["DINE_IN", "PICKUP", "DELIVERY"]),
  rank: z.coerce.number().int().nonnegative().default(0),
  active: z.coerce.boolean().default(true),
});

export async function saveSubType(fd: FormData) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const parsed = S.parse({
    id: fd.get("id") || undefined,
    name: fd.get("name"),
    parentType: fd.get("parentType"),
    rank: fd.get("rank") || 0,
    active: fd.get("active") === "on",
  });
  if (parsed.id) {
    await db.subOrderType.update({ where: { id: parsed.id }, data: { ...parsed, id: undefined } });
  } else {
    await db.subOrderType.create({ data: { ...parsed, id: undefined, outletId: outlet.id } });
  }
  revalidatePath("/settings/sub-types");
  revalidatePath("/billing");
}

export async function deleteSubType(fd: FormData) {
  await requireUser("MANAGER");
  const id = String(fd.get("id"));
  if (!id) return;
  await db.subOrderType.delete({ where: { id } });
  revalidatePath("/settings/sub-types");
  revalidatePath("/billing");
}
