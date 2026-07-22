// Customer Value Engine — shared types.
// This module is pure: no imports from prisma, no I/O. All persistence
// concerns live in the campaign / wallet services on top of this.

export const CONDITION_TYPES = [
  "CUSTOMER_TAG",
  "MEMBERSHIP",
  "OUTLET",
  "DATE_RANGE",
  "TIME_RANGE",
  "BILL_AMOUNT",
  "VISIT_COUNT",
  "GENDER",
  "BIRTHDAY",
  "ANNIVERSARY",
  "CATEGORY_PURCHASED",
  "PRODUCT_PURCHASED",
  "PAYMENT_METHOD",
  "FIRST_VISIT",
  "CUSTOM_FIELD",
] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

export const BENEFIT_TYPES = [
  "WALLET_CREDIT",
  "WALLET_CASHBACK",
  "PERCENT_DISCOUNT",
  "FLAT_DISCOUNT",
  "FREE_ITEM",
  "DAILY_ITEM",
  "WEEKLY_ITEM",
  "MONTHLY_ITEM",
  "REWARD_POINTS",
  "BIRTHDAY_BENEFIT",
  "ANNIVERSARY_BENEFIT",
  "PRIORITY_SEATING",
  "EXCLUSIVE_PRICING",
  "FREE_DELIVERY",
  "ENTRY_WAIVER",
  "CUSTOM",
] as const;
export type BenefitType = (typeof BENEFIT_TYPES)[number];

export const WALLET_BUCKETS = [
  "CAMPAIGN",
  "CASHBACK",
  "MEMBERSHIP",
  "REFERRAL",
  "REFUND",
  "LOYALTY",
  "MANUAL",
] as const;
export type WalletBucket = (typeof WALLET_BUCKETS)[number];

// PRD FIFO order: expiring first (handled in wallet FIFO code), then this
// bucket priority. LOYALTY / MANUAL sit at the end — they're carve-outs.
export const BUCKET_PRIORITY: WalletBucket[] = [
  "CAMPAIGN",
  "CASHBACK",
  "MEMBERSHIP",
  "REFERRAL",
  "REFUND",
  "LOYALTY",
  "MANUAL",
];

/** Input to condition evaluators + benefit resolvers. Snapshot-shaped so
 * the engine is deterministic — callers hydrate this from the DB once. */
export type RuleContext = {
  /** Evaluation timestamp — used for DATE_RANGE / TIME_RANGE / BIRTHDAY. */
  now: Date;
  outletId: string;

  customer?: {
    id: string;
    tags: string[];
    birthday: Date | null;
    anniversary: Date | null;
    gender: string | null;
    /** Customer.createdAt — used for FIRST_VISIT when visitCount is 0. */
    createdAt: Date;
    /** Completed bills so far, before the current one. */
    visitCount: number;
    /** Active memberships (not expired, active flag on). */
    activeMemberships: { planId: string; expiresAt: Date }[];
    customFields?: Record<string, string | number | boolean>;
  };

  order?: {
    outletId: string;
    total: number;
    paymentMethods: string[];
    items: {
      itemId: string;
      categoryId: string | null;
      qty: number;
      unitPrice: number;
    }[];
  };
};

export type RuleDef = {
  id: string;
  conditionType: ConditionType;
  configJson: string;
  /** How this rule joins the running result to its left. First rule ignores this. */
  groupOp: "AND" | "OR";
  order: number;
};

export type BenefitDefLike = {
  id: string;
  type: BenefitType;
  name: string;
  configJson: string;
};

/** Optional per-campaign override JSON merged over BenefitDef.configJson. */
export type CampaignBenefitLike = {
  benefitDef: BenefitDefLike;
  overrideJson?: string | null;
};

export type CampaignLike = {
  id: string;
  name: string;
  priority: number;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
  outletId: string;
  rules: RuleDef[];
  benefits: CampaignBenefitLike[];
};

/** The result of resolving a benefit against a specific RuleContext.
 * `amount` is the rupee value this delivers on the current bill; it's 0
 * for informational benefits (PRIORITY_SEATING etc). */
export type ResolvedBenefit = {
  campaignId?: string;
  benefitDefId: string;
  type: BenefitType;
  label: string;
  amount: number;
  detail: BenefitDetail;
  /** External idempotency key — safe to write into WalletTransaction or
   * RedemptionHistory unchanged. Callers may append a bill scope. */
  idempotencyKey: string;
};

export type BenefitDetail =
  | { kind: "WALLET_CREDIT"; amount: number; bucket: WalletBucket; expiresInDays?: number }
  | {
      kind: "DISCOUNT";
      mode: "PERCENT" | "FLAT";
      value: number;
      cap?: number;
      appliesTo: "BILL" | "CATEGORY" | "ITEM";
      categoryIds?: string[];
      itemIds?: string[];
    }
  | { kind: "FREE_ITEM"; itemId: string; qty: number; cadence?: "DAILY" | "WEEKLY" | "MONTHLY" }
  | { kind: "REWARD_POINTS"; points: number }
  | { kind: "EXCLUSIVE_PRICING"; overrides: { itemId: string; price: number }[] }
  | { kind: "FREE_DELIVERY" }
  | { kind: "ENTRY_WAIVER"; amount: number }
  | { kind: "INFO"; note: string };

export type EvaluationResult = {
  campaign: CampaignLike;
  eligible: boolean;
  reason?: string;
  benefits: ResolvedBenefit[];
};
