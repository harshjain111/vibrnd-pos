// Customer Value Engine — DB glue for evaluating offers for a customer.
//
// Hydrates a RuleContext from the database (customer, active memberships,
// optional order snapshot) and asks the pure engine which campaigns fire.
// Called from the billing screen ("show me what applies") and from the
// post-settle hook ("credit the campaigns that fired").

import "server-only";
import { db } from "@/lib/db";
import { evaluateAll } from "./engine";
import type { CampaignLike, EvaluationResult, RuleContext, RuleDef, ConditionType, BenefitType } from "./types";

export type OrderSnapshot = RuleContext["order"];

export async function evaluateCustomerOffers(
  customerId: string,
  outletId: string,
  order?: OrderSnapshot,
  at: Date = new Date(),
): Promise<EvaluationResult[]> {
  const customer = await db.customer.findFirst({
    where: { id: customerId },
    include: {
      memberships: {
        where: { active: true, expiresAt: { gt: at } },
        select: { planId: true, expiresAt: true },
      },
      orders: {
        where: { status: { in: ["PAID", "DELIVERED", "PICKED_UP"] } },
        select: { id: true },
      },
    },
  });
  if (!customer) return [];

  const campaignRows = await db.campaign.findMany({
    where: {
      outletId,
      active: true,
      startsAt: { lte: at },
      endsAt: { gte: at },
    },
    include: {
      rules: { orderBy: { order: "asc" } },
      benefits: { include: { benefitDef: true }, orderBy: { order: "asc" } },
    },
  });

  // Redemption caps enforced here so an "eligible" result already respects
  // max-per-customer + max-redemptions rather than pushing that to the
  // caller. Keeps every caller correct.
  const capsBlocked = new Set<string>();
  for (const c of campaignRows) {
    if (c.maxRedemptions == null && c.maxPerCustomer == null) continue;
    const [totalCount, perCustomerCount] = await Promise.all([
      c.maxRedemptions != null
        ? db.redemptionHistory.count({ where: { campaignId: c.id } })
        : Promise.resolve(0),
      c.maxPerCustomer != null
        ? db.redemptionHistory.count({
            where: { campaignId: c.id, customerId },
          })
        : Promise.resolve(0),
    ]);
    if (c.maxRedemptions != null && totalCount >= c.maxRedemptions) capsBlocked.add(c.id);
    if (c.maxPerCustomer != null && perCustomerCount >= c.maxPerCustomer) capsBlocked.add(c.id);
  }

  const ctx: RuleContext = {
    now: at,
    outletId,
    customer: {
      id: customer.id,
      tags: parseTags(customer.tags),
      birthday: customer.birthday ?? null,
      anniversary: customer.anniversary ?? null,
      gender: null,
      createdAt: customer.createdAt,
      visitCount: customer.orders.length,
      activeMemberships: customer.memberships.map((m) => ({
        planId: m.planId,
        expiresAt: m.expiresAt,
      })),
    },
    order,
  };

  const campaigns: CampaignLike[] = campaignRows
    .filter((c) => !capsBlocked.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      priority: c.priority,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      active: c.active,
      outletId: c.outletId,
      rules: c.rules.map((r) => ({
        id: r.id,
        conditionType: r.conditionType as ConditionType,
        configJson: r.configJson,
        groupOp: (r.groupOp as "AND" | "OR") ?? "AND",
        order: r.order,
      })) satisfies RuleDef[],
      benefits: c.benefits
        .filter((b) => b.benefitDef.active)
        .map((b) => ({
          benefitDef: {
            id: b.benefitDef.id,
            type: b.benefitDef.type as BenefitType,
            name: b.benefitDef.name,
            configJson: b.benefitDef.configJson,
          },
          overrideJson: b.overrideJson,
        })),
    }));

  return evaluateAll(campaigns, ctx);
}

/** Customer.tags is a CSV column in the existing schema. */
function parseTags(csv: string | null | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
