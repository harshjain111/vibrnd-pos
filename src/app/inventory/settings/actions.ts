"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { logActivity } from "@/lib/audit";

/** Save a batch of toggles for one tab. Values come in as form fields. */
export async function saveInventorySettings(tab: string, fd: FormData) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const entries: { key: string; value: string }[] = [];
  fd.forEach((v, k) => {
    if (k.startsWith("__")) return;
    entries.push({ key: k, value: String(v) });
  });
  // Use upsert per entry (small N → simpler than computing diff)
  for (const e of entries) {
    await db.inventorySetting.upsert({
      where: { outletId_key: { outletId: outlet.id, key: e.key } },
      update: { value: e.value, tab, updatedById: user?.id ?? null },
      create: { outletId: outlet.id, tab, key: e.key, value: e.value, updatedById: user?.id ?? null },
    });
  }
  await logActivity({
    action: "UPDATE",
    entity: "InventorySetting",
    entityId: tab,
    summary: `Updated ${entries.length} setting(s) on ${tab}`,
    outletId: outlet.id,
  });
  revalidatePath("/inventory/settings");
}
