// Customer Value Engine — DB glue for the Benefit Engine.
//
// Two entry points, one shared hydrator:
//   evaluateCustomerOffers(customerId, outletId, order?)         → bill context
//   evaluateCustomerOffersForTrigger(customerId, outletId, trig) → non-bill triggers
//                                                                  (registration,
//                                                                   recharge, birthday,
//                                                                   etc)
//
// And an applier:
//   applyBenefits(customer, outletId, results, ...) → writes RedemptionHistory
//                                                     and (for wallet destinations)
//                                                     wallet.credit rows. Non-wallet
//                                                     destinations are surfaced to
//                                                     the caller as pending work.

import "server-only";
import { db } from "@/lib/db";
import { evaluateAll } from "./engine";
import type {
  BenefitType,
  CampaignLike,
  ConditionType,
  DestinationKind,
  EvaluationResult,
  ResolvedBenefit,
  RuleContext,
  RuleDef,
  TriggerKind,
} from "./types";
import { credit } from "./wallet";

export type OrderSnapshot = RuleContext["order"];

/** Extends the engine's per-campaign result with the campaign's
 * declared destinationKind + per-benefit destinationOverride so the
 * caller knows where to apply each benefit. */
export type CampaignEvaluation = EvaluationResult & {
  destinationKind: DestinationKind | null;
  destinationOverrides: Record<string, DestinationKind | null>;
};

/** Full-bill evaluator — kept for the customer profile preview + POS. */
export async function evaluateCustomerOffers(
  customerId: string,
  outletId: string,
  order?: OrderSnapshot,
  at: Date = new Date(),
): Promise<CampaignEvaluation[]> {
  return runEvaluation(customerId, outletId, {
    order,
    at,
    triggerFilter: null,
  });
}

/** Trigger evaluator — for registration, top-up, birthday cron, etc. */
export async function evaluateCustomerOffersForTrigger(
  customerId: string,
  outletId: string,
  trigger: TriggerKind,
  at: Date = new Date(),
): Promise<CampaignEvaluation[]> {
  return runEvaluation(customerId, outletId, {
    order: undefined,
    at,
    triggerFilter: trigger,
  });
}

async function runEvaluation(
  customerId: string,
  outletId: string,
  opts: {
    order?: OrderSnapshot;
    at: Date;
    triggerFilter: TriggerKind | null;
  },
): Promise<CampaignEvaluation[]> {
  const { at } = opts;
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
      ...(opts.triggerFilter ? { trigger: opts.triggerFilter } : {}),
    },
    include: {
      rules: { orderBy: { order: "asc" } },
      benefits: { include: { benefitDef: true }, orderBy: { order: "asc" } },
    },
  });

  // Redemption caps.
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
    order: opts.order,
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

  const results = evaluateAll(campaigns, ctx);

  // Merge destination metadata onto each result so the applier knows
  // where each benefit lands.
  const rowById = new Map(campaignRows.map((c) => [c.id, c]));
  return results.map<CampaignEvaluation>((r) => {
    const row = rowById.get(r.campaign.id);
    const overrides: Record<string, DestinationKind | null> = {};
    for (const cb of row?.benefits ?? []) {
      overrides[cb.benefitDefId] = (cb.destinationOverride as DestinationKind | null) ?? null;
    }
    return {
      ...r,
      destinationKind: (row?.destinationKind as DestinationKind | null) ?? null,
      destinationOverrides: overrides,
    };
  });
}

// ─── Applier ───────────────────────────────────────────────────────────

export type ApplyOptions = {
  customerId: string;
  outletId: string;
  actor?: string;
  /** Free-form scope for idempotency — e.g. topup transaction id, or
   * `order:<orderId>` after settle. */
  applyScope: string;
  /** Optional order id to link on wallet transactions + redemption rows. */
  orderId?: string;
};

export type ApplySummary = {
  walletCreditsApplied: number;
  walletCreditTotal: number;
  /** Benefits whose destination we can't apply yet (DISCOUNT / COUPON /
   * REWARD_POINTS / FREE_PRODUCT / MEMBERSHIP). Surfaced to the caller
   * so the billing screen can render them as line items. */
  pendingByDestination: Partial<Record<DestinationKind, ResolvedBenefit[]>>;
};

/** Persist eligible benefits. Wallet destinations write to the ledger
 * (idempotent per benefit+scope). Non-wallet destinations are returned
 * to the caller for downstream application. */
export async function applyBenefits(
  results: CampaignEvaluation[],
  opts: ApplyOptions,
): Promise<ApplySummary> {
  const summary: ApplySummary = {
    walletCreditsApplied: 0,
    walletCreditTotal: 0,
    pendingByDestination: {},
  };

  for (const r of results) {
    for (const b of r.benefits) {
      const destination =
        r.destinationOverrides[b.benefitDefId] ?? r.destinationKind ?? "CASH_WALLET";
      const rememberedKey = `${b.idempotencyKey}:${opts.applyScope}`;

      if (destination === "CASH_WALLET" || destination === "PROMO_WALLET") {
        // Only wallet-credit benefits actually move money at this layer.
        if (b.detail.kind !== "WALLET_CREDIT" || b.amount <= 0) continue;
        try {
          await credit({
            customerId: opts.customerId,
            outletId: opts.outletId,
            bucket: destination === "PROMO_WALLET" ? "PROMO" : "CASH",
            sourceKind: "CAMPAIGN",
            amount: b.amount,
            source: `Campaign: ${r.campaign.name}`,
            expiresInDays: b.detail.expiresInDays,
            campaignId: r.campaign.id,
            actor: opts.actor ?? "system",
            orderId: opts.orderId,
            txIdempotencyKey: rememberedKey,
            remarks: b.label,
          });
          // Offer-level ledger for cap enforcement.
          await db.redemptionHistory.upsert({
            where: { idempotencyKey: rememberedKey },
            create: {
              customerId: opts.customerId,
              campaignId: r.campaign.id,
              benefitLabel: b.label,
              orderId: opts.orderId ?? null,
              outletId: opts.outletId,
              amount: b.amount,
              metaJson: JSON.stringify({ destination, benefitDefId: b.benefitDefId }),
              idempotencyKey: rememberedKey,
            },
            update: {},
          });
          summary.walletCreditsApplied++;
          summary.walletCreditTotal += b.amount;
        } catch (err) {
          console.error("[cve/applyBenefits] wallet credit failed", err);
        }
      } else {
        (summary.pendingByDestination[destination] ??= []).push(b);
      }
    }
  }

  return summary;
}

function parseTags(csv: string | null | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
