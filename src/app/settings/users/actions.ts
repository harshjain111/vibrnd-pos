"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser, ROLES as ALL_ROLES } from "@/lib/rbac";
import { logActivity } from "@/lib/audit";

// Same source of truth the sidebar / permission registry uses — keeps the
// user-creation dropdown in lock-step with the role list.
const ROLES = ALL_ROLES;

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

/**
 * One-click "Seed test users" — provisions one user per front-of-house
 * role (Manager, Cashier, Captain, Receptionist) with deterministic
 * emails so the owner can flip between roles to test the role-aware
 * flows without juggling passwords. Idempotent: skips any role whose
 * test email already exists. Returns a transcript the dialog renders
 * so the owner can copy-paste creds.
 */
type SeedRow = {
  role: string;
  email: string;
  name: string;
  password: string;
  status: "created" | "existed" | "failed";
  error?: string;
};

/**
 * One-click test-user seed. Per-row try/catch so a single failure (existing
 * email with conflicting role, DB connection blip, etc) doesn't drop the
 * other rows on the floor — historic gotcha was the receptionist row not
 * landing because the loop bailed mid-way. Each row reports back its own
 * status so the dialog can flag which ones need attention.
 */
export async function seedTestUsers(): Promise<{ ok: true; rows: SeedRow[] } | { ok: false; error: string }> {
  try {
    await requireUser("OWNER");
    const outlet = await getActiveOutlet();
    const password = "test123";
    const hash = await bcrypt.hash(password, 10);

    const targets: { role: string; email: string; name: string }[] = [
      { role: "MANAGER",      email: "manager@test.com",      name: "Test Manager" },
      { role: "BILLER",       email: "cashier@test.com",      name: "Test Cashier" },
      { role: "CAPTAIN",      email: "captain@test.com",      name: "Test Captain" },
      { role: "RECEPTIONIST", email: "receptionist@test.com", name: "Test Receptionist" },
    ];

    const rows: SeedRow[] = [];
    for (const t of targets) {
      try {
        const existing = await db.user.findUnique({ where: { email: t.email } });
        if (existing) {
          // Re-attach the test password + activate + ensure the role matches
          // what the seed wants. Self-heal lets the owner click the button
          // again to recover from any earlier partial / wrong-role seed.
          await db.user.update({
            where: { id: existing.id },
            data: {
              role: t.role,
              active: true,
              passwordHash: hash,
              outletId: outlet.id,
            },
          });
          rows.push({ ...t, password, status: "existed" });
          continue;
        }
        await db.user.create({
          data: {
            name: t.name,
            email: t.email,
            role: t.role,
            passwordHash: hash,
            outletId: outlet.id,
          },
        });
        rows.push({ ...t, password, status: "created" });
      } catch (e) {
        rows.push({
          ...t,
          password,
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const created = rows.filter((r) => r.status === "created").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    await logActivity({
      action: "CREATE",
      entity: "Outlet",
      entityId: outlet.id,
      summary: `Seeded test users — ${created} created, ${rows.length - created - failed} reset, ${failed} failed`,
      outletId: outlet.id,
    });
    revalidatePath("/settings/users");
    revalidatePath("/logs");
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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
