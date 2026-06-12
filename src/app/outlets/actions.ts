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
  /** Chain topology kind. OUTLET = customer-facing restaurant (default).
   *  BASE_STORE / BASE_KITCHEN = chain-level locations (no POS, slim UI). */
  kind: z.enum(["OUTLET", "BASE_STORE", "BASE_KITCHEN"]).default("OUTLET"),
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
      kind: (fd.get("kind") as string) || "OUTLET",
    });
  } catch {
    return { error: "Invalid input." };
  }
  const exists = await db.outlet.findUnique({ where: { code: parsed.code } });
  if (exists) return { error: "Outlet code already exists." };

  const created = await db.outlet.create({ data: parsed });

  // Always auto-create a STORE department — every outlet (OUTLET / BS / BK)
  // needs one to hold incoming stock. OUTLET kinds also get the usual
  // sub-departments so HOD requisitions work out of the box.
  await db.department.create({
    data: { outletId: created.id, kind: "STORE", name: "Store", active: true },
  });
  if (parsed.kind === "OUTLET") {
    for (const [kind, name] of [
      ["KITCHEN", "Kitchen"],
      ["BAR", "Bar"],
      ["HOUSEKEEPING", "Housekeeping"],
    ] as const) {
      await db.department.create({
        data: { outletId: created.id, kind, name, active: true },
      });
    }

    // Menu surfaces only make sense at OUTLET kinds.
    for (const name of ["Starters", "Main Course", "Breads", "Beverages", "Desserts"]) {
      await db.category.create({ data: { name, outletId: created.id } });
    }
    for (const [name, rate] of [["Nil", 0], ["GST 5%", 5], ["GST 12%", 12], ["GST 18%", 18]] as const) {
      await db.taxSlab.create({ data: { name, rate, outletId: created.id } });
    }
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

const Topology = z.object({
  id: z.string(),
  kind: z.enum(["OUTLET", "BASE_STORE", "BASE_KITCHEN"]),
  baseStoreOutletId: z.string().optional(),
  baseKitchenOutletId: z.string().optional(),
});

/**
 * Set an outlet's chain topology — its kind plus the BS / BK it pulls
 * supplies from. Only OUTLET-kind outlets get FK fields populated; BS/BK
 * have those nulled out. Validates that the referenced BS/BK are real
 * and of the right kind.
 */
export async function setOutletTopology(input: z.infer<typeof Topology>): Promise<{ ok?: true; error?: string }> {
  await requireUser("OWNER");
  let data: z.infer<typeof Topology>;
  try {
    data = Topology.parse(input);
  } catch {
    return { error: "Invalid input" };
  }
  const target = await db.outlet.findUnique({ where: { id: data.id } });
  if (!target) return { error: "Outlet not found" };

  // Validate BS / BK refs match expected kinds.
  if (data.kind === "OUTLET") {
    if (data.baseStoreOutletId) {
      const bs = await db.outlet.findFirst({
        where: { id: data.baseStoreOutletId, active: true },
      });
      if (!bs || (bs as any).kind !== "BASE_STORE") {
        return { error: "Base Store reference is not a BASE_STORE outlet" };
      }
    }
    if (data.baseKitchenOutletId) {
      const bk = await db.outlet.findFirst({
        where: { id: data.baseKitchenOutletId, active: true },
      });
      if (!bk || (bk as any).kind !== "BASE_KITCHEN") {
        return { error: "Base Kitchen reference is not a BASE_KITCHEN outlet" };
      }
    }
  }

  // BS / BK can't have a BS / BK of their own.
  const nullForChain = data.kind === "OUTLET" ? false : true;

  await db.outlet.update({
    where: { id: data.id },
    data: {
      kind: data.kind,
      baseStoreOutletId: nullForChain ? null : data.baseStoreOutletId ?? null,
      baseKitchenOutletId: nullForChain ? null : data.baseKitchenOutletId ?? null,
    } as any,
  });

  // Make sure a STORE dept exists for any outlet (idempotent).
  const store = await db.department.findFirst({
    where: { outletId: data.id, kind: "STORE", active: true },
  });
  if (!store) {
    await db.department.create({
      data: { outletId: data.id, kind: "STORE", name: "Store", active: true },
    });
  }

  await logActivity({
    action: "UPDATE",
    entity: "Outlet",
    entityId: data.id,
    summary: `Set ${target.name} topology — kind=${data.kind}${
      data.kind === "OUTLET"
        ? ` BS=${data.baseStoreOutletId ?? "—"} BK=${data.baseKitchenOutletId ?? "—"}`
        : ""
    }`,
    outletId: data.id,
  });

  revalidatePath("/outlets");
  revalidatePath("/", "layout");
  return { ok: true };
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
