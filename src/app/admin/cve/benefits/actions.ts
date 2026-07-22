"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { logActivity } from "@/lib/audit";
import { BENEFIT_TYPES, WALLET_BUCKETS } from "@/lib/cve/types";
import { validateBenefitConfig } from "@/lib/cve/benefits";

const SaveInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name required").max(80),
  type: z.enum(BENEFIT_TYPES),
  active: z.boolean().default(true),
  configJson: z.string().trim().min(2), // "{}" minimum
});

export type BenefitFormState = { error?: string; ok?: boolean } | null;

export async function saveBenefitAction(
  _prev: BenefitFormState,
  fd: FormData,
): Promise<BenefitFormState> {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();

  let parsed;
  try {
    parsed = SaveInput.parse({
      id: fd.get("id") || undefined,
      name: fd.get("name") ?? "",
      type: fd.get("type"),
      active: fd.get("active") === "on",
      configJson: fd.get("configJson") ?? "{}",
    });
  } catch (err: any) {
    return { error: err?.issues?.[0]?.message ?? "Invalid input" };
  }

  let cfg: any;
  try {
    cfg = JSON.parse(parsed.configJson);
  } catch {
    return { error: "Config JSON is malformed" };
  }
  const v = validateBenefitConfig(parsed.type, cfg);
  if (!v.ok) return { error: v.reason };
  if (parsed.type === "WALLET_CREDIT" || parsed.type === "WALLET_CASHBACK") {
    const bucket = cfg?.bucket ?? (parsed.type === "WALLET_CASHBACK" ? "CASHBACK" : "CAMPAIGN");
    if (!WALLET_BUCKETS.includes(bucket)) {
      return { error: `Invalid wallet bucket ${bucket}` };
    }
  }

  const canonical = JSON.stringify(cfg);

  if (parsed.id) {
    await db.benefitDef.update({
      where: { id: parsed.id },
      data: { name: parsed.name, type: parsed.type, active: parsed.active, configJson: canonical },
    });
    await logActivity({
      action: "UPDATE",
      entity: "Customer",
      entityId: parsed.id,
      summary: `Updated benefit "${parsed.name}" (${parsed.type})`,
      outletId: outlet.id,
    });
  } else {
    const row = await db.benefitDef.create({
      data: {
        outletId: outlet.id,
        name: parsed.name,
        type: parsed.type,
        active: parsed.active,
        configJson: canonical,
      },
    });
    await logActivity({
      action: "CREATE",
      entity: "Customer",
      entityId: row.id,
      summary: `Created benefit "${parsed.name}" (${parsed.type})`,
      outletId: outlet.id,
    });
  }

  revalidatePath("/admin/cve/benefits");
  revalidatePath("/admin/cve");
  return { ok: true };
}

const ToggleInput = z.object({ id: z.string(), active: z.boolean() });

export async function toggleBenefitAction(fd: FormData) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const parsed = ToggleInput.parse({
    id: fd.get("id"),
    active: fd.get("active") === "true",
  });
  await db.benefitDef.update({
    where: { id: parsed.id },
    data: { active: parsed.active },
  });
  await logActivity({
    action: "UPDATE",
    entity: "Customer",
    entityId: parsed.id,
    summary: `${parsed.active ? "Activated" : "Deactivated"} benefit`,
    outletId: outlet.id,
  });
  revalidatePath("/admin/cve/benefits");
}

const AttachInput = z.object({
  benefitDefId: z.string(),
  planId: z.string(),
  displayName: z.string().trim().min(1),
});

export async function attachToPlanAction(fd: FormData) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const parsed = AttachInput.parse({
    benefitDefId: fd.get("benefitDefId"),
    planId: fd.get("planId"),
    displayName: fd.get("displayName") ?? "",
  });
  const def = await db.benefitDef.findFirst({
    where: { id: parsed.benefitDefId, outletId: outlet.id },
    select: { id: true, name: true },
  });
  if (!def) return;
  const plan = await db.membershipPlan.findFirst({
    where: { id: parsed.planId, outletId: outlet.id },
    select: { id: true, name: true },
  });
  if (!plan) return;
  // Skip if already linked to this plan.
  const dupe = await db.membershipBenefit.findFirst({
    where: { planId: plan.id, benefitDefId: def.id },
    select: { id: true },
  });
  if (dupe) return;
  await db.membershipBenefit.create({
    data: {
      planId: plan.id,
      name: parsed.displayName || def.name,
      benefitDefId: def.id,
      qtyPerDay: 1,
    },
  });
  await logActivity({
    action: "UPDATE",
    entity: "Customer",
    entityId: plan.id,
    summary: `Attached benefit "${def.name}" to plan "${plan.name}"`,
    outletId: outlet.id,
  });
  revalidatePath("/admin/cve/benefits");
  revalidatePath("/memberships");
}

export async function detachFromPlanAction(fd: FormData) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const id = String(fd.get("membershipBenefitId") ?? "");
  if (!id) return;
  const row = await db.membershipBenefit.findFirst({
    where: { id, plan: { outletId: outlet.id } },
    include: { plan: { select: { name: true, id: true } } },
  });
  if (!row) return;
  await db.membershipBenefit.delete({ where: { id: row.id } });
  await logActivity({
    action: "UPDATE",
    entity: "Customer",
    entityId: row.plan.id,
    summary: `Detached benefit "${row.name}" from plan "${row.plan.name}"`,
    outletId: outlet.id,
  });
  revalidatePath("/admin/cve/benefits");
  revalidatePath("/memberships");
}
