"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { logActivity } from "@/lib/audit";

const SaveInput = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  captainId: z.string().optional(),
  /// Tables that should belong to this group. The settings UI uses a
  /// checkbox grid; we replace the whole assignment list per save so
  /// the join stays consistent.
  tableIds: z.array(z.string()),
});

export async function saveTableGroup(input: z.infer<typeof SaveInput>) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const data = SaveInput.parse(input);

  // captainId === "" means "no captain". Normalise to null so the FK
  // doesn't choke. Verify the captain belongs to this outlet so a
  // tampered form can't link some other outlet's user.
  let captainId: string | null = null;
  if (data.captainId) {
    const u = await db.user.findFirst({
      where: { id: data.captainId, outletId: outlet.id, role: "CAPTAIN" },
      select: { id: true },
    });
    if (!u) throw new Error("Captain not found in this outlet");
    captainId = u.id;
  }

  let groupId: string;
  if (data.id) {
    const g = await db.tableGroup.update({
      where: { id: data.id },
      data: { name: data.name, captainId },
    });
    groupId = g.id;
  } else {
    const g = await db.tableGroup.create({
      data: { name: data.name, captainId, outletId: outlet.id },
    });
    groupId = g.id;
  }

  // Reset every table's tableGroupId for THIS group (free the previously
  // assigned ones), then assign the picked tables. Two separate
  // updateMany calls so a single tx-less round trip stays atomic enough.
  await db.diningTable.updateMany({
    where: { tableGroupId: groupId },
    data: { tableGroupId: null },
  });
  if (data.tableIds.length > 0) {
    await db.diningTable.updateMany({
      where: { id: { in: data.tableIds }, outletId: outlet.id },
      data: { tableGroupId: groupId },
    });
  }

  await logActivity({
    action: data.id ? "UPDATE" : "CREATE",
    entity: "Table",
    entityId: groupId,
    summary: `${data.id ? "Updated" : "Created"} table group "${data.name}" with ${data.tableIds.length} table(s)`,
    outletId: outlet.id,
  });

  revalidatePath("/settings/table-groups");
  revalidatePath("/orders/live");
  return { ok: true as const, id: groupId };
}

export async function deleteTableGroup(fd: FormData) {
  await requireUser("MANAGER");
  const id = String(fd.get("id"));
  if (!id) return;
  const g = await db.tableGroup.findUnique({ where: { id } });
  if (!g) return;
  // Free the assigned tables first so the FK doesn't restrict the delete.
  await db.diningTable.updateMany({
    where: { tableGroupId: id },
    data: { tableGroupId: null },
  });
  await db.tableGroup.delete({ where: { id } });
  await logActivity({
    action: "DELETE",
    entity: "Table",
    entityId: id,
    summary: `Deleted table group "${g.name}"`,
    outletId: g.outletId,
  });
  revalidatePath("/settings/table-groups");
  revalidatePath("/orders/live");
}
