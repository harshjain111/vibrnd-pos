"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { logActivity } from "@/lib/audit";
import { CONDITION_TYPES } from "@/lib/cve/types";
import { validateConditionConfig } from "@/lib/cve/conditions";

// Payload shape sent by the client — one JSON blob containing everything
// so the form works as a single server action call.
const RuleInput = z.object({
  conditionType: z.enum(CONDITION_TYPES),
  configJson: z.string().min(2),
  groupOp: z.enum(["AND", "OR"]).default("AND"),
});
const BenefitInput = z.object({
  benefitDefId: z.string(),
  overrideJson: z.string().optional(),
});
const CampaignInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(400).optional().nullable(),
  active: z.boolean().default(true),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  priority: z.coerce.number().int().default(0),
  maxRedemptions: z.coerce.number().int().positive().optional().nullable(),
  maxPerCustomer: z.coerce.number().int().positive().optional().nullable(),
  rules: z.array(RuleInput),
  benefits: z.array(BenefitInput).min(1, "At least one benefit is required"),
});

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveCampaign(payloadJson: string): Promise<SaveResult> {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();

  let parsed;
  try {
    const raw = JSON.parse(payloadJson);
    parsed = CampaignInput.parse(raw);
  } catch (err: any) {
    return { ok: false, error: err?.issues?.[0]?.message ?? err?.message ?? "Invalid payload" };
  }

  const startsAt = new Date(parsed.startsAt);
  const endsAt = new Date(parsed.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { ok: false, error: "Start / End dates are invalid" };
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    return { ok: false, error: "End must be after Start" };
  }

  // Validate each rule config server-side so a broken JSON blob can't
  // sneak past the client validator.
  for (let i = 0; i < parsed.rules.length; i++) {
    const r = parsed.rules[i];
    let cfg;
    try {
      cfg = JSON.parse(r.configJson);
    } catch {
      return { ok: false, error: `Rule ${i + 1}: config JSON is malformed` };
    }
    const v = validateConditionConfig(r.conditionType, cfg);
    if (!v.ok) return { ok: false, error: `Rule ${i + 1} (${r.conditionType}): ${v.reason}` };
  }

  // Ensure every referenced benefit belongs to this outlet.
  const benefitIds = parsed.benefits.map((b) => b.benefitDefId);
  const defs = await db.benefitDef.findMany({
    where: { id: { in: benefitIds }, outletId: outlet.id },
    select: { id: true, name: true, active: true },
  });
  if (defs.length !== new Set(benefitIds).size) {
    return { ok: false, error: "One or more benefits belong to a different outlet" };
  }

  const data = {
    name: parsed.name,
    description: parsed.description ?? null,
    active: parsed.active,
    startsAt,
    endsAt,
    priority: parsed.priority,
    maxRedemptions: parsed.maxRedemptions ?? null,
    maxPerCustomer: parsed.maxPerCustomer ?? null,
    outletId: outlet.id,
  };

  const id = await db.$transaction(async (tx) => {
    let campaignId: string;
    if (parsed.id) {
      const updated = await tx.campaign.update({ where: { id: parsed.id }, data });
      campaignId = updated.id;
      await tx.campaignRule.deleteMany({ where: { campaignId } });
      await tx.campaignBenefit.deleteMany({ where: { campaignId } });
    } else {
      const created = await tx.campaign.create({ data });
      campaignId = created.id;
    }

    if (parsed.rules.length > 0) {
      await tx.campaignRule.createMany({
        data: parsed.rules.map((r, i) => ({
          campaignId,
          conditionType: r.conditionType,
          configJson: canonicalJson(r.configJson),
          groupOp: i === 0 ? "AND" : r.groupOp,
          order: i,
        })),
      });
    }
    await tx.campaignBenefit.createMany({
      data: parsed.benefits.map((b, i) => ({
        campaignId,
        benefitDefId: b.benefitDefId,
        overrideJson: b.overrideJson ? canonicalJson(b.overrideJson) : null,
        order: i,
      })),
    });

    await logActivity({
      action: parsed.id ? "UPDATE" : "CREATE",
      entity: "Customer",
      entityId: campaignId,
      summary: `${parsed.id ? "Updated" : "Created"} campaign "${parsed.name}"`,
      outletId: outlet.id,
    });
    return campaignId;
  });

  revalidatePath("/admin/cve/campaigns");
  revalidatePath("/admin/cve");
  return { ok: true, id };
}

export async function toggleCampaign(fd: FormData) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const id = String(fd.get("id") ?? "");
  const active = fd.get("active") === "true";
  if (!id) return;
  const row = await db.campaign.findFirst({
    where: { id, outletId: outlet.id },
    select: { id: true, name: true },
  });
  if (!row) return;
  await db.campaign.update({ where: { id }, data: { active } });
  await logActivity({
    action: "UPDATE",
    entity: "Customer",
    entityId: id,
    summary: `${active ? "Activated" : "Deactivated"} campaign "${row.name}"`,
    outletId: outlet.id,
  });
  revalidatePath("/admin/cve/campaigns");
}

export async function deleteCampaign(fd: FormData) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  const row = await db.campaign.findFirst({
    where: { id, outletId: outlet.id },
    select: { id: true, name: true, redemptions: { select: { id: true }, take: 1 } },
  });
  if (!row) return;
  if (row.redemptions.length > 0) {
    // Never delete a campaign with real redemption history — deactivate
    // it instead so audit trails stay intact.
    await db.campaign.update({ where: { id }, data: { active: false } });
    await logActivity({
      action: "UPDATE",
      entity: "Customer",
      entityId: id,
      summary: `Cannot delete campaign "${row.name}" — has redemptions. Deactivated instead.`,
      outletId: outlet.id,
    });
  } else {
    await db.campaign.delete({ where: { id } });
    await logActivity({
      action: "DELETE",
      entity: "Customer",
      entityId: id,
      summary: `Deleted campaign "${row.name}"`,
      outletId: outlet.id,
    });
  }
  revalidatePath("/admin/cve/campaigns");
  redirect("/admin/cve/campaigns");
}

function canonicalJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return raw;
  }
}
