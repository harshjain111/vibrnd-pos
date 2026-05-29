"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { logActivity } from "@/lib/audit";

const ROLES = ["OWNER", "MANAGER", "BILLER", "CAPTAIN"] as const;

const CreateInput = z.object({
  name: z.string().min(1),
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
  role: z.enum(ROLES),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const UpdateInput = z.object({
  id: z.string(),
  name: z.string().min(1),
  role: z.enum(ROLES),
  active: z.boolean().default(true),
  commissionRate: z.coerce.number().min(0).max(100).default(0),
});

export async function createUser(_state: { error?: string } | null, fd: FormData): Promise<{ error?: string }> {
  await requireUser("OWNER");
  const outlet = await getActiveOutlet();
  let parsed: z.infer<typeof CreateInput>;
  try {
    parsed = CreateInput.parse({
      name: fd.get("name"),
      email: fd.get("email"),
      role: fd.get("role"),
      password: fd.get("password"),
    });
  } catch (e: any) {
    return { error: e?.errors?.[0]?.message ?? "Invalid input." };
  }

  const exists = await db.user.findUnique({ where: { email: parsed.email } });
  if (exists) return { error: "That email already exists." };

  const hash = await bcrypt.hash(parsed.password, 10);
  const created = await db.user.create({
    data: {
      name: parsed.name,
      email: parsed.email,
      role: parsed.role,
      passwordHash: hash,
      outletId: outlet.id,
    },
  });
  await logActivity({
    action: "CREATE",
    entity: "Outlet",
    entityId: created.id,
    summary: `Invited user ${parsed.email} as ${parsed.role}`,
    outletId: outlet.id,
  });
  revalidatePath("/settings/users");
  revalidatePath("/logs");
  return {};
}

export async function updateUser(fd: FormData) {
  await requireUser("OWNER");
  const outlet = await getActiveOutlet();
  const parsed = UpdateInput.parse({
    id: fd.get("id"),
    name: fd.get("name"),
    role: fd.get("role"),
    active: fd.get("active") === "on",
    commissionRate: fd.get("commissionRate") || 0,
  });
  const updated = await db.user.update({
    where: { id: parsed.id },
    data: {
      name: parsed.name,
      role: parsed.role,
      active: parsed.active,
      commissionRate: parsed.commissionRate,
    },
  });
  await logActivity({
    action: "UPDATE",
    entity: "Outlet",
    entityId: updated.id,
    summary: `Updated ${updated.email} → ${updated.role}${updated.active ? "" : " (deactivated)"}`,
    outletId: outlet.id,
  });
  revalidatePath("/settings/users");
  revalidatePath("/logs");
}

export async function resetPassword(fd: FormData) {
  await requireUser("OWNER");
  const outlet = await getActiveOutlet();
  const id = String(fd.get("id"));
  const password = String(fd.get("password") ?? "");
  if (password.length < 6) throw new Error("Password too short");
  const hash = await bcrypt.hash(password, 10);
  const u = await db.user.update({ where: { id }, data: { passwordHash: hash } });
  await logActivity({
    action: "UPDATE",
    entity: "Outlet",
    entityId: id,
    summary: `Reset password for ${u.email}`,
    outletId: outlet.id,
  });
  revalidatePath("/settings/users");
  revalidatePath("/logs");
}

export async function deleteUser(fd: FormData) {
  const me = await requireUser("OWNER");
  const id = String(fd.get("id"));
  if (id === me.id) throw new Error("You can't delete yourself");
  const u = await db.user.findUnique({ where: { id } });
  if (!u) return;
  await db.user.delete({ where: { id } });
  await logActivity({
    action: "DELETE",
    entity: "Outlet",
    entityId: id,
    summary: `Deleted user ${u.email}`,
    outletId: u.outletId,
  });
  revalidatePath("/settings/users");
  revalidatePath("/logs");
}
