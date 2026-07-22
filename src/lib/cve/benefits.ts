// Customer Value Engine — benefit resolvers.
// Given a BenefitDef (+ optional per-campaign override) and a RuleContext,
// produce a ResolvedBenefit describing exactly what value the customer
// gets on THIS bill. The wallet / POS layers consume the result:
//   • DISCOUNT   → POS applies it as a bill/line adjustment
//   • FREE_ITEM  → POS auto-adds the item at ₹0
//   • WALLET_CREDIT → wallet.credit(...) writes the ledger row post-settle
//   • REWARD_POINTS → loyalty.earn(...)
//   • INFO       → surfaced in the offer chip; no monetary side-effect

import type {
  BenefitDefLike,
  BenefitDetail,
  BenefitType,
  CampaignBenefitLike,
  ResolvedBenefit,
  RuleContext,
  WalletBucket,
} from "./types";

type Ok = { ok: true };
type Err = { ok: false; reason: string };

function parse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** Merge override JSON over the base config. Shallow — nested arrays /
 * objects are replaced wholesale (that's what admins expect). */
function mergedConfig(def: BenefitDefLike, overrideJson?: string | null): any {
  const base = parse<Record<string, unknown>>(def.configJson) ?? {};
  const over = parse<Record<string, unknown>>(overrideJson) ?? {};
  return { ...base, ...over };
}

function categoryTotal(ctx: RuleContext, categoryIds: string[]): number {
  if (!ctx.order) return 0;
  const set = new Set(categoryIds);
  return ctx.order.items
    .filter((l) => l.categoryId && set.has(l.categoryId))
    .reduce((s, l) => s + l.qty * l.unitPrice, 0);
}

function itemTotal(ctx: RuleContext, itemIds: string[]): number {
  if (!ctx.order) return 0;
  const set = new Set(itemIds);
  return ctx.order.items
    .filter((l) => set.has(l.itemId))
    .reduce((s, l) => s + l.qty * l.unitPrice, 0);
}

function discountBase(cfg: any, ctx: RuleContext): number {
  const applies: string = cfg?.appliesTo ?? "BILL";
  if (applies === "CATEGORY")
    return categoryTotal(ctx, Array.isArray(cfg?.categoryIds) ? cfg.categoryIds : []);
  if (applies === "ITEM")
    return itemTotal(ctx, Array.isArray(cfg?.itemIds) ? cfg.itemIds : []);
  return ctx.order?.total ?? 0;
}

function idempotencyKey(campaignId: string | undefined, benefitDefId: string, ctx: RuleContext): string {
  const scope = ctx.order?.outletId ?? ctx.outletId;
  const cust = ctx.customer?.id ?? "anon";
  const c = campaignId ?? "static";
  // Callers append `:order:<orderId>` after settle so the same benefit can
  // be evaluated multiple times pre-settle without over-crediting.
  return `cve:${c}:${benefitDefId}:${cust}:${scope}`;
}

// ─── individual resolvers ────────────────────────────────────────────────

function resolveWalletCredit(cfg: any): { amount: number; detail: BenefitDetail } {
  const amount = Math.max(0, Number(cfg?.amount ?? 0));
  const bucket = (cfg?.bucket ?? "CAMPAIGN") as WalletBucket;
  const expiresInDays = cfg?.expiresInDays != null ? Number(cfg.expiresInDays) : undefined;
  return {
    amount,
    detail: { kind: "WALLET_CREDIT", amount, bucket, expiresInDays },
  };
}

function resolveWalletCashback(cfg: any, ctx: RuleContext): { amount: number; detail: BenefitDetail } {
  const base = ctx.order?.total ?? 0;
  const percent = Math.max(0, Number(cfg?.percent ?? 0));
  const raw = Math.floor((base * percent) / 100);
  const cap = cfg?.cap != null ? Number(cfg.cap) : Infinity;
  const amount = Math.min(raw, cap);
  const bucket = (cfg?.bucket ?? "CASHBACK") as WalletBucket;
  const expiresInDays = cfg?.expiresInDays != null ? Number(cfg.expiresInDays) : undefined;
  return { amount, detail: { kind: "WALLET_CREDIT", amount, bucket, expiresInDays } };
}

function resolveDiscount(
  mode: "PERCENT" | "FLAT",
  cfg: any,
  ctx: RuleContext,
): { amount: number; detail: BenefitDetail } {
  const base = discountBase(cfg, ctx);
  let amount: number;
  if (mode === "PERCENT") {
    const p = Math.max(0, Math.min(100, Number(cfg?.percent ?? 0)));
    amount = Math.floor((base * p) / 100);
  } else {
    amount = Math.max(0, Number(cfg?.amount ?? 0));
    if (amount > base) amount = base;
  }
  const cap = cfg?.cap != null ? Number(cfg.cap) : Infinity;
  if (amount > cap) amount = cap;
  return {
    amount,
    detail: {
      kind: "DISCOUNT",
      mode,
      value: mode === "PERCENT" ? Number(cfg?.percent ?? 0) : Number(cfg?.amount ?? 0),
      cap: cfg?.cap != null ? Number(cfg.cap) : undefined,
      appliesTo: (cfg?.appliesTo ?? "BILL") as "BILL" | "CATEGORY" | "ITEM",
      categoryIds: Array.isArray(cfg?.categoryIds) ? cfg.categoryIds : undefined,
      itemIds: Array.isArray(cfg?.itemIds) ? cfg.itemIds : undefined,
    },
  };
}

function resolveFreeItem(cfg: any, cadence?: "DAILY" | "WEEKLY" | "MONTHLY"): {
  amount: number;
  detail: BenefitDetail;
} {
  const itemId = String(cfg?.itemId ?? "");
  const qty = Math.max(1, Number(cfg?.qty ?? 1));
  // amount = notional value; callers may set cfg.value to override for
  // reporting, else 0 (POS-side price fills in at redemption time).
  const amount = Math.max(0, Number(cfg?.value ?? 0));
  return { amount, detail: { kind: "FREE_ITEM", itemId, qty, cadence } };
}

function resolveRewardPoints(cfg: any, ctx: RuleContext): { amount: number; detail: BenefitDetail } {
  const per = String(cfg?.per ?? "BILL");
  if (per === "RUPEE") {
    const ratio = Math.max(0.0001, Number(cfg?.ratio ?? 10)); // 1 point per ratio ₹
    const points = Math.floor((ctx.order?.total ?? 0) / ratio);
    return { amount: points, detail: { kind: "REWARD_POINTS", points } };
  }
  const points = Math.max(0, Math.floor(Number(cfg?.points ?? 0)));
  return { amount: points, detail: { kind: "REWARD_POINTS", points } };
}

function resolveExclusivePricing(cfg: any): { amount: number; detail: BenefitDetail } {
  const overrides = Array.isArray(cfg?.overrides)
    ? cfg.overrides
        .filter((o: any) => o?.itemId && Number.isFinite(Number(o?.price)))
        .map((o: any) => ({ itemId: String(o.itemId), price: Number(o.price) }))
    : [];
  return { amount: 0, detail: { kind: "EXCLUSIVE_PRICING", overrides } };
}

function resolveEntryWaiver(cfg: any): { amount: number; detail: BenefitDetail } {
  const amount = Math.max(0, Number(cfg?.amount ?? 0));
  return { amount, detail: { kind: "ENTRY_WAIVER", amount } };
}

function resolveBirthdayOrAnniversary(
  kind: "BIRTHDAY_BENEFIT" | "ANNIVERSARY_BENEFIT",
  cfg: any,
): { amount: number; detail: BenefitDetail } {
  const walletCredit = Math.max(0, Number(cfg?.walletCredit ?? 0));
  if (walletCredit > 0) {
    const bucket = (cfg?.bucket ?? "CAMPAIGN") as WalletBucket;
    return {
      amount: walletCredit,
      detail: { kind: "WALLET_CREDIT", amount: walletCredit, bucket, expiresInDays: cfg?.expiresInDays },
    };
  }
  if (cfg?.freeItemId) {
    return {
      amount: 0,
      detail: {
        kind: "FREE_ITEM",
        itemId: String(cfg.freeItemId),
        qty: Number(cfg?.qty ?? 1),
      },
    };
  }
  return {
    amount: 0,
    detail: { kind: "INFO", note: cfg?.note ?? (kind === "BIRTHDAY_BENEFIT" ? "Birthday" : "Anniversary") },
  };
}

function resolveInfo(note: string): { amount: number; detail: BenefitDetail } {
  return { amount: 0, detail: { kind: "INFO", note } };
}

// ─── public API ──────────────────────────────────────────────────────────

export function resolveBenefit(
  cb: CampaignBenefitLike,
  ctx: RuleContext,
  campaignId?: string,
): ResolvedBenefit {
  const cfg = mergedConfig(cb.benefitDef, cb.overrideJson);
  const t = cb.benefitDef.type;
  let out: { amount: number; detail: BenefitDetail };

  switch (t) {
    case "WALLET_CREDIT":
      out = resolveWalletCredit(cfg);
      break;
    case "WALLET_CASHBACK":
      out = resolveWalletCashback(cfg, ctx);
      break;
    case "PERCENT_DISCOUNT":
      out = resolveDiscount("PERCENT", cfg, ctx);
      break;
    case "FLAT_DISCOUNT":
      out = resolveDiscount("FLAT", cfg, ctx);
      break;
    case "FREE_ITEM":
      out = resolveFreeItem(cfg);
      break;
    case "DAILY_ITEM":
      out = resolveFreeItem(cfg, "DAILY");
      break;
    case "WEEKLY_ITEM":
      out = resolveFreeItem(cfg, "WEEKLY");
      break;
    case "MONTHLY_ITEM":
      out = resolveFreeItem(cfg, "MONTHLY");
      break;
    case "REWARD_POINTS":
      out = resolveRewardPoints(cfg, ctx);
      break;
    case "BIRTHDAY_BENEFIT":
      out = resolveBirthdayOrAnniversary("BIRTHDAY_BENEFIT", cfg);
      break;
    case "ANNIVERSARY_BENEFIT":
      out = resolveBirthdayOrAnniversary("ANNIVERSARY_BENEFIT", cfg);
      break;
    case "PRIORITY_SEATING":
      out = resolveInfo(cfg?.note ?? "Priority seating");
      break;
    case "EXCLUSIVE_PRICING":
      out = resolveExclusivePricing(cfg);
      break;
    case "FREE_DELIVERY":
      out = { amount: Number(cfg?.value ?? 0), detail: { kind: "FREE_DELIVERY" } };
      break;
    case "ENTRY_WAIVER":
      out = resolveEntryWaiver(cfg);
      break;
    case "CUSTOM":
      out = resolveInfo(cfg?.note ?? cb.benefitDef.name);
      break;
    default:
      out = { amount: 0, detail: { kind: "INFO", note: `Unhandled: ${t}` } };
  }

  return {
    campaignId,
    benefitDefId: cb.benefitDef.id,
    type: t,
    label: cb.benefitDef.name,
    amount: out.amount,
    detail: out.detail,
    idempotencyKey: idempotencyKey(campaignId, cb.benefitDef.id, ctx),
  };
}

export function validateBenefitConfig(type: BenefitType, cfg: any): Ok | Err {
  if (cfg == null || typeof cfg !== "object")
    return { ok: false, reason: "Config must be an object" };
  switch (type) {
    case "WALLET_CREDIT":
      if (!Number.isFinite(Number(cfg.amount)) || Number(cfg.amount) <= 0)
        return { ok: false, reason: "Amount must be > 0" };
      return { ok: true };
    case "WALLET_CASHBACK":
      if (!Number.isFinite(Number(cfg.percent)) || Number(cfg.percent) <= 0)
        return { ok: false, reason: "Percent must be > 0" };
      return { ok: true };
    case "PERCENT_DISCOUNT": {
      const p = Number(cfg.percent);
      if (!Number.isFinite(p) || p <= 0 || p > 100)
        return { ok: false, reason: "Percent must be between 0 and 100" };
      return { ok: true };
    }
    case "FLAT_DISCOUNT":
      if (!Number.isFinite(Number(cfg.amount)) || Number(cfg.amount) <= 0)
        return { ok: false, reason: "Amount must be > 0" };
      return { ok: true };
    case "FREE_ITEM":
    case "DAILY_ITEM":
    case "WEEKLY_ITEM":
    case "MONTHLY_ITEM":
      if (!cfg.itemId) return { ok: false, reason: "Pick an item" };
      return { ok: true };
    case "REWARD_POINTS":
      if (cfg.per === "RUPEE") {
        if (!Number.isFinite(Number(cfg.ratio)) || Number(cfg.ratio) <= 0)
          return { ok: false, reason: "Ratio must be > 0" };
      } else if (!Number.isFinite(Number(cfg.points)) || Number(cfg.points) <= 0) {
        return { ok: false, reason: "Points must be > 0" };
      }
      return { ok: true };
    case "BIRTHDAY_BENEFIT":
    case "ANNIVERSARY_BENEFIT":
      if (!cfg.walletCredit && !cfg.freeItemId && !cfg.note)
        return { ok: false, reason: "Configure a wallet credit, free item or message" };
      return { ok: true };
    case "EXCLUSIVE_PRICING":
      if (!Array.isArray(cfg.overrides) || cfg.overrides.length === 0)
        return { ok: false, reason: "Add at least one item price override" };
      return { ok: true };
    case "ENTRY_WAIVER":
      if (!Number.isFinite(Number(cfg.amount)) || Number(cfg.amount) <= 0)
        return { ok: false, reason: "Amount must be > 0" };
      return { ok: true };
    case "PRIORITY_SEATING":
    case "FREE_DELIVERY":
    case "CUSTOM":
      return { ok: true };
    default:
      return { ok: false, reason: `Unknown benefit type ${type}` };
  }
}
