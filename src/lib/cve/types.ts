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

// v2 — two buckets only. See docs/cve-prd.md §4.2.
//   CASH  — fully redeemable. No caps. Never expires (unless per-credit).
//   PROMO — restricted per credit (expiry, max %, min bill, outlet /
//           product / category / usage limits).
// The granular "where did this money come from?" answer lives on
// WalletTransaction.sourceKind — reporting label, not a bucket.
export const WALLET_BUCKETS = ["CASH", "PROMO"] as const;
export type WalletBucket = (typeof WALLET_BUCKETS)[number];

// Redemption priority within the wallet at settle time (PRD §8):
// Promotional Wallet drains before Cash Wallet — burn the restricted /
// time-limited money first, save the customer's fully-redeemable Cash
// balance for last.
export const BUCKET_PRIORITY: WalletBucket[] = ["PROMO", "CASH"];

/** Plain-English label + one-line explanation for the wallet UI. */
export const BUCKET_META: Record<WalletBucket, { label: string; hint: string }> = {
  CASH:  { label: "Cash Wallet",         hint: "Fully redeemable. Recharge, bonus, cashback, refunds and manual credits all land here." },
  PROMO: { label: "Promotional Balance", hint: "Restricted credit — expiry, max % of bill, outlet or product caps apply per credit." },
};

// v2 — sourceKind vocabulary. Reporting label on every ledger row. Adding
// a new source kind is code-only; it does NOT change wallet behaviour.
export const SOURCE_KINDS = [
  "RECHARGE",
  "RECHARGE_BONUS",
  "CASHBACK",
  "REFERRAL",
  "REFUND",
  "MANUAL",
  "CAMPAIGN",
  "MEMBERSHIP",
  "LOYALTY_CONVERT",
  "EXPIRY",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_KIND_META: Record<SourceKind, { label: string; hint: string }> = {
  RECHARGE:        { label: "Recharge",         hint: "Customer paid real money to top up." },
  RECHARGE_BONUS:  { label: "Recharge bonus",   hint: "Bonus credited on a top-up." },
  CASHBACK:        { label: "Cashback",         hint: "% of a bill returned after settle." },
  REFERRAL:        { label: "Referral reward",  hint: "Reward for a successful referral." },
  REFUND:          { label: "Refund",           hint: "Refunded to wallet instead of cash." },
  MANUAL:          { label: "Manual",           hint: "Admin adjustment (goodwill, correction)." },
  CAMPAIGN:        { label: "Campaign",         hint: "Fired by a promotion." },
  MEMBERSHIP:      { label: "Membership",       hint: "Fired by a membership benefit." },
  LOYALTY_CONVERT: { label: "Loyalty converted", hint: "Loyalty points converted to wallet." },
  EXPIRY:          { label: "Expiry",           hint: "Credit expired and was written off." },
};

// v2 — campaign destination vocabulary (where a benefit lands).
export const DESTINATION_KINDS = [
  "CASH_WALLET",
  "PROMO_WALLET",
  "MEMBERSHIP",
  "DISCOUNT",
  "COUPON",
  "REWARD_POINTS",
  "FREE_PRODUCT",
] as const;
export type DestinationKind = (typeof DESTINATION_KINDS)[number];

export const DESTINATION_META: Record<DestinationKind, { label: string; hint: string }> = {
  CASH_WALLET:   { label: "Cash Wallet",         hint: "Fully redeemable credit added to the customer's Cash Wallet." },
  PROMO_WALLET:  { label: "Promotional Wallet",  hint: "Restricted credit — set caps and expiry on the benefit." },
  MEMBERSHIP:    { label: "Enrol in membership", hint: "Enrols the customer in a named plan." },
  DISCOUNT:      { label: "Discount on this bill", hint: "Applied directly at settle." },
  COUPON:        { label: "Issue coupon",        hint: "Code the customer can use on a later bill." },
  REWARD_POINTS: { label: "Reward points",       hint: "Credited to the loyalty balance." },
  FREE_PRODUCT:  { label: "Free product",        hint: "Auto-adds an item to the current or next bill at ₹0." },
};

// v2 — campaign trigger vocabulary.
export const TRIGGER_KINDS = [
  "REGISTRATION",
  "WALLET_RECHARGE",
  "BILL_GENERATED",
  "BILL_PAID",
  "FIRST_VISIT",
  "BIRTHDAY",
  "ANNIVERSARY",
  "REFERRAL",
  "MANUAL_TRIGGER",
] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

/** Map any string (including legacy v1 bucket names) to the v2 CASH/PROMO
 * enum. Migration 20260726_backfill_buckets rewrites the DB so this
 * only fires for stale caches / in-flight code between deploys, but
 * keeping it means we can't accidentally strand a row on an unknown
 * bucket string. */
export function normalizeBucket(value: string | null | undefined): WalletBucket {
  const v = String(value ?? "").toUpperCase();
  if (v === "CASH" || v === "PROMO") return v as WalletBucket;
  // v1 → v2 collapse
  if (v === "CAMPAIGN") return "PROMO";
  return "CASH";
}

/** Same idea for sourceKind — legacy code paths may not set it yet. */
export function normalizeSourceKind(
  value: string | null | undefined,
): SourceKind {
  const v = String(value ?? "").toUpperCase();
  if ((SOURCE_KINDS as readonly string[]).includes(v)) return v as SourceKind;
  // v1 bucket name → nearest sourceKind
  switch (v) {
    case "CAMPAIGN":   return "CAMPAIGN";
    case "CASHBACK":   return "CASHBACK";
    case "MEMBERSHIP": return "MEMBERSHIP";
    case "REFERRAL":   return "REFERRAL";
    case "REFUND":     return "REFUND";
    case "LOYALTY":    return "LOYALTY_CONVERT";
    case "PREPAID":    return "RECHARGE";
    default:           return "MANUAL";
  }
}

export const TRIGGER_META: Record<TriggerKind, { label: string; hint: string }> = {
  REGISTRATION:    { label: "Customer registers",  hint: "Fires when a new customer is created." },
  WALLET_RECHARGE: { label: "Wallet recharge",     hint: "Fires on every top-up (optional min amount)." },
  BILL_GENERATED:  { label: "Bill generated",      hint: "Fires when a bill is saved, pre-settle." },
  BILL_PAID:       { label: "Bill paid",           hint: "Fires when a bill is settled." },
  FIRST_VISIT:     { label: "First visit",         hint: "Fires on the customer's first ever bill." },
  BIRTHDAY:        { label: "Birthday",            hint: "Fires within N days of the customer's birthday." },
  ANNIVERSARY:     { label: "Anniversary",         hint: "Fires within N days of the customer's anniversary." },
  REFERRAL:        { label: "Referral converted",  hint: "Fires when a referred customer's first bill lands." },
  MANUAL_TRIGGER:  { label: "Manual trigger",      hint: "Fires only when an admin explicitly runs the campaign." },
};

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
