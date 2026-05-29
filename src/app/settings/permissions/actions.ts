"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { getActiveOutlet } from "@/lib/outlet";
import { PAGES, findPage, type PageId } from "@/lib/permissions";
import { logActivity } from "@/lib/audit";

const ROLES = ["OWNER", "MANAGER", "BILLER", "CAPTAIN"] as const;

const SaveInput = z.object({
  // CSV of `role:pageId` pairs that should be allowed.
  allowed: z.string().optional(),
});

/**
 * Save the entire permission matrix for the current outlet.
 * Receives a CSV of `role:pageId` pairs that are currently checked in the UI;
 * writes one upsert per (role, page) deviating from the default.
 */
export async function savePermissions(fd: FormData) {
  const actor = await requireUser("OWNER");
  const outlet = await getActiveOutlet();
  const { allowed } = SaveInput.parse({ allowed: fd.get("allowed") || "" });
  const checked = new Set((allowed ?? "").split(",").filter(Boolean));

  // Walk every (role, page) combination. If the box state differs from the
  // hard-coded default we persist an override row; if it matches the default,
  // remove any stale override.
  for (const page of PAGES) {
    for (const role of ROLES) {
      // Owner-only pages cannot be granted to lower roles via override.
      if (page.ownerOnly && role !== "OWNER") continue;
      const isChecked = checked.has(`${role}:${page.id}`);
      const isDefault = page.defaultRoles.includes(role);
      if (isChecked === isDefault) {
        // Matches default — remove any override row.
        await db.rolePermission.deleteMany({
          where: { outletId: outlet.id, role, pageId: page.id },
        });
      } else {
        // Differs from default — upsert the override.
        await db.rolePermission.upsert({
          where: { outletId_role_pageId: { outletId: outlet.id, role, pageId: page.id } },
          create: { outletId: outlet.id, role, pageId: page.id, allowed: isChecked, updatedById: actor.id },
          update: { allowed: isChecked, updatedById: actor.id },
        });
      }
    }
  }

  await logActivity({
    action: "UPDATE",
    entity: "Outlet",
    entityId: outlet.id,
    summary: `Updated permission matrix (${checked.size} role × page allowances)`,
    outletId: outlet.id,
  });

  revalidatePath("/settings/permissions");
  revalidatePath("/");
}

/** Wipe every override for this outlet — revert to the hard-coded defaults. */
export async function resetPermissions() {
  const actor = await requireUser("OWNER");
  const outlet = await getActiveOutlet();
  await db.rolePermission.deleteMany({ where: { outletId: outlet.id } });
  await logActivity({
    action: "UPDATE",
    entity: "Outlet",
    entityId: outlet.id,
    summary: `Reset permission matrix to defaults`,
    outletId: outlet.id,
  });
  revalidatePath("/settings/permissions");
  revalidatePath("/");
}
