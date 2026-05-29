"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { OUTLET_COOKIE } from "@/lib/outlet";
import { logActivity } from "@/lib/audit";

const O = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(32),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  gstin: z.string().optional(),
  fssai: z.string().optional(),
});

export async function createOutlet(fd: FormData): Promise<{ ok?: true; error?: string }> {
  await requireUser("OWNER");
  let parsed: z.infer<typeof O>;
  try {
    parsed = O.parse({
      name: fd.get("name"),
      code: fd.get("code"),
      address: fd.get("address") || undefined,
      phone: fd.get("phone") || undefined,
      email: fd.get("email") || undefined,
      gstin: fd.get("gstin") || undefined,
      fssai: fd.get("fssai") || undefined,
    });
  } catch {
    return { error: "Invalid input." };
  }
  const exists = await db.outlet.findUnique({ where: { code: parsed.code } });
  if (exists) return { error: "Outlet code already exists." };

  const created = await db.outlet.create({ data: parsed });

  // Seed minimal categories so the new outlet isn't blank
  for (const name of ["Starters", "Main Course", "Breads", "Beverages", "Desserts"]) {
    await db.category.create({ data: { name, outletId: created.id } });
  }
  // Seed default tax slabs
  for (const [name, rate] of [["Nil", 0], ["GST 5%", 5], ["GST 12%", 12], ["GST 18%", 18]] as const) {
    await db.taxSlab.create({ data: { name, rate, outletId: created.id } });
  }

  await logActivity({
    action: "CREATE",
    entity: "Outlet",
    entityId: created.id,
    summary: `Created outlet ${parsed.name} (${parsed.code})`,
    outletId: created.id,
  });

  revalidatePath("/outlets");
  return { ok: true };
}

export async function switchOutlet(fd: FormData) {
  const id = String(fd.get("id"));
  const o = await db.outlet.findFirst({ where: { id, active: true } });
  if (!o) return;
  const c = await cookies();
  c.set(OUTLET_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/", "layout");
}

export async function deactivateOutlet(fd: FormData) {
  await requireUser("OWNER");
  const id = String(fd.get("id"));
  const total = await db.outlet.count({ where: { active: true } });
  if (total <= 1) throw new Error("Can't deactivate the last outlet");
  await db.outlet.update({ where: { id }, data: { active: false } });
  revalidatePath("/outlets");
  revalidatePath("/", "layout");
}
