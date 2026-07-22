// Customer Value Engine — condition evaluators.
// One function per condition type. Every evaluator returns `boolean`; the
// engine composes them via AND / OR (see engine.ts).
//
// configJson shape is fixed per the PRD vocabulary. Bad JSON / missing
// fields return `false` — a broken campaign should never fire; the admin
// builder validates on save.

import type { ConditionType, RuleContext } from "./types";

type Ok = { ok: true };
type Err = { ok: false; reason: string };

function parse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** Common comparison operator used by BILL_AMOUNT / VISIT_COUNT. */
function cmp(
  actual: number,
  op: string,
  value: number,
  valueMax?: number,
): boolean {
  switch (op) {
    case ">=": return actual >= value;
    case "<=": return actual <= value;
    case ">": return actual > value;
    case "<": return actual < value;
    case "=":
    case "==":
      return actual === value;
    case "!=":
      return actual !== value;
    case "BETWEEN":
      return valueMax != null && actual >= value && actual <= valueMax;
    default:
      return false;
  }
}

/** Local midnight → helpful for comparing day-only fields. */
function startOfLocalDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** Parse "HH:mm" into minutes since local midnight; -1 on error. */
function parseHm(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return -1;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return -1;
  return h * 60 + mm;
}

/** ±daysBetween any two dates ignoring years. Used by BIRTHDAY / ANNIVERSARY. */
function dayOfYearDistance(a: Date, b: Date): number {
  const y = a.getFullYear();
  const anchor = new Date(y, b.getMonth(), b.getDate());
  const prev = new Date(y - 1, b.getMonth(), b.getDate());
  const next = new Date(y + 1, b.getMonth(), b.getDate());
  const ms = 86400_000;
  const d1 = Math.abs(a.getTime() - anchor.getTime()) / ms;
  const d2 = Math.abs(a.getTime() - prev.getTime()) / ms;
  const d3 = Math.abs(a.getTime() - next.getTime()) / ms;
  return Math.floor(Math.min(d1, d2, d3));
}

// ─── individual evaluators ────────────────────────────────────────────────

function evalCustomerTag(cfg: any, ctx: RuleContext): boolean {
  if (!ctx.customer) return false;
  const values: string[] = Array.isArray(cfg?.values) ? cfg.values : [];
  const has = values.some((v) => ctx.customer!.tags.includes(v));
  return cfg?.op === "NOT_IN" ? !has : has;
}

function evalMembership(cfg: any, ctx: RuleContext): boolean {
  if (!ctx.customer) return false;
  const planIds: string[] = Array.isArray(cfg?.planIds) ? cfg.planIds : [];
  const active = ctx.customer.activeMemberships.map((m) => m.planId);
  switch (cfg?.op) {
    case "HAS":
      return planIds.every((p) => active.includes(p));
    case "HAS_ANY":
      return planIds.some((p) => active.includes(p));
    case "DOES_NOT_HAVE":
      return !planIds.some((p) => active.includes(p));
    case "ANY_ACTIVE":
      return active.length > 0;
    default:
      return false;
  }
}

function evalOutlet(cfg: any, ctx: RuleContext): boolean {
  const values: string[] = Array.isArray(cfg?.outletIds) ? cfg.outletIds : [];
  const included = values.includes(ctx.outletId);
  return cfg?.op === "NOT_IN" ? !included : included;
}

function evalDateRange(cfg: any, ctx: RuleContext): boolean {
  const now = ctx.now.getTime();
  if (cfg?.from) {
    const t = Date.parse(cfg.from);
    if (!isNaN(t) && now < t) return false;
  }
  if (cfg?.to) {
    const t = Date.parse(cfg.to);
    if (!isNaN(t) && now > t) return false;
  }
  if (Array.isArray(cfg?.daysOfWeek) && cfg.daysOfWeek.length > 0) {
    if (!cfg.daysOfWeek.includes(ctx.now.getDay())) return false;
  }
  return true;
}

function evalTimeRange(cfg: any, ctx: RuleContext): boolean {
  const start = parseHm(String(cfg?.start ?? ""));
  const end = parseHm(String(cfg?.end ?? ""));
  if (start < 0 || end < 0) return false;
  const nowMin = ctx.now.getHours() * 60 + ctx.now.getMinutes();
  if (start <= end) return nowMin >= start && nowMin <= end;
  // Overnight (e.g. 22:00 → 02:00).
  return nowMin >= start || nowMin <= end;
}

function evalBillAmount(cfg: any, ctx: RuleContext): boolean {
  const total = ctx.order?.total ?? 0;
  return cmp(total, String(cfg?.op ?? ">="), Number(cfg?.value ?? 0), Number(cfg?.valueMax));
}

function evalVisitCount(cfg: any, ctx: RuleContext): boolean {
  if (!ctx.customer) return false;
  return cmp(
    ctx.customer.visitCount,
    String(cfg?.op ?? ">="),
    Number(cfg?.value ?? 0),
    Number(cfg?.valueMax),
  );
}

function evalGender(cfg: any, ctx: RuleContext): boolean {
  if (!ctx.customer?.gender) return false;
  const values: string[] = Array.isArray(cfg?.values) ? cfg.values : [];
  const included = values
    .map((v) => v.toUpperCase())
    .includes(ctx.customer.gender.toUpperCase());
  return cfg?.op === "NOT_IN" ? !included : included;
}

function evalBirthday(cfg: any, ctx: RuleContext): boolean {
  if (!ctx.customer?.birthday) return false;
  const within = Number(cfg?.withinDays ?? 0);
  return dayOfYearDistance(startOfLocalDay(ctx.now), ctx.customer.birthday) <= within;
}

function evalAnniversary(cfg: any, ctx: RuleContext): boolean {
  if (!ctx.customer?.anniversary) return false;
  const within = Number(cfg?.withinDays ?? 0);
  return dayOfYearDistance(startOfLocalDay(ctx.now), ctx.customer.anniversary) <= within;
}

function evalCategoryPurchased(cfg: any, ctx: RuleContext): boolean {
  if (!ctx.order) return false;
  const cats: string[] = Array.isArray(cfg?.categoryIds) ? cfg.categoryIds : [];
  if (cats.length === 0) return false;
  const minQty = Number(cfg?.minQty ?? 1);
  const totals = new Map<string, number>();
  for (const l of ctx.order.items) {
    if (!l.categoryId) continue;
    totals.set(l.categoryId, (totals.get(l.categoryId) ?? 0) + l.qty);
  }
  const hits = cats.filter((c) => (totals.get(c) ?? 0) >= minQty);
  return cfg?.op === "ALL_OF" ? hits.length === cats.length : hits.length > 0;
}

function evalProductPurchased(cfg: any, ctx: RuleContext): boolean {
  if (!ctx.order) return false;
  const items: string[] = Array.isArray(cfg?.itemIds) ? cfg.itemIds : [];
  if (items.length === 0) return false;
  const minQty = Number(cfg?.minQty ?? 1);
  const totals = new Map<string, number>();
  for (const l of ctx.order.items) {
    totals.set(l.itemId, (totals.get(l.itemId) ?? 0) + l.qty);
  }
  const hits = items.filter((i) => (totals.get(i) ?? 0) >= minQty);
  return cfg?.op === "ALL_OF" ? hits.length === items.length : hits.length > 0;
}

function evalPaymentMethod(cfg: any, ctx: RuleContext): boolean {
  if (!ctx.order) return false;
  const values: string[] = Array.isArray(cfg?.methods) ? cfg.methods : [];
  const paid = new Set(ctx.order.paymentMethods.map((m) => m.toUpperCase()));
  const hit = values.some((v) => paid.has(v.toUpperCase()));
  return cfg?.op === "NOT_IN" ? !hit : hit;
}

function evalFirstVisit(_cfg: any, ctx: RuleContext): boolean {
  if (!ctx.customer) return false;
  return ctx.customer.visitCount === 0;
}

function evalCustomField(cfg: any, ctx: RuleContext): boolean {
  if (!ctx.customer?.customFields) return false;
  const key = String(cfg?.key ?? "");
  if (!key) return false;
  const actual = ctx.customer.customFields[key];
  if (actual == null) return false;
  const value = cfg?.value;
  const s = String(actual).toLowerCase();
  const v = String(value ?? "").toLowerCase();
  switch (cfg?.op) {
    case "=":
    case "==":
      return s === v;
    case "!=":
      return s !== v;
    case "CONTAINS":
      return s.includes(v);
    case "IN": {
      const arr: any[] = Array.isArray(value) ? value : [];
      return arr.map((x) => String(x).toLowerCase()).includes(s);
    }
    default:
      return false;
  }
}

const EVALUATORS: Record<ConditionType, (cfg: any, ctx: RuleContext) => boolean> = {
  CUSTOMER_TAG: evalCustomerTag,
  MEMBERSHIP: evalMembership,
  OUTLET: evalOutlet,
  DATE_RANGE: evalDateRange,
  TIME_RANGE: evalTimeRange,
  BILL_AMOUNT: evalBillAmount,
  VISIT_COUNT: evalVisitCount,
  GENDER: evalGender,
  BIRTHDAY: evalBirthday,
  ANNIVERSARY: evalAnniversary,
  CATEGORY_PURCHASED: evalCategoryPurchased,
  PRODUCT_PURCHASED: evalProductPurchased,
  PAYMENT_METHOD: evalPaymentMethod,
  FIRST_VISIT: evalFirstVisit,
  CUSTOM_FIELD: evalCustomField,
};

export function evaluateCondition(
  type: ConditionType,
  configJson: string,
  ctx: RuleContext,
): boolean {
  const fn = EVALUATORS[type];
  if (!fn) return false;
  const cfg = parse<any>(configJson) ?? {};
  return fn(cfg, ctx);
}

// Config-shape validators for the admin builder — kept here so schema
// vocabulary lives in one place. Returns null on OK, or an error string.
export function validateConditionConfig(
  type: ConditionType,
  cfg: any,
): Ok | Err {
  if (cfg == null || typeof cfg !== "object") {
    return { ok: false, reason: "Config must be an object" };
  }
  switch (type) {
    case "CUSTOMER_TAG":
    case "GENDER":
      if (!Array.isArray(cfg.values) || cfg.values.length === 0)
        return { ok: false, reason: "Provide at least one value" };
      return { ok: true };
    case "MEMBERSHIP":
      if (cfg.op === "ANY_ACTIVE") return { ok: true };
      if (!Array.isArray(cfg.planIds) || cfg.planIds.length === 0)
        return { ok: false, reason: "Provide at least one membership plan" };
      return { ok: true };
    case "OUTLET":
      if (!Array.isArray(cfg.outletIds) || cfg.outletIds.length === 0)
        return { ok: false, reason: "Provide at least one outlet" };
      return { ok: true };
    case "DATE_RANGE":
      if (!cfg.from && !cfg.to && !Array.isArray(cfg.daysOfWeek))
        return { ok: false, reason: "Provide a date range or days-of-week" };
      return { ok: true };
    case "TIME_RANGE":
      if (parseHm(cfg.start ?? "") < 0 || parseHm(cfg.end ?? "") < 0)
        return { ok: false, reason: "Start/End must be HH:mm" };
      return { ok: true };
    case "BILL_AMOUNT":
    case "VISIT_COUNT":
      if (typeof cfg.value !== "number")
        return { ok: false, reason: "Numeric value required" };
      return { ok: true };
    case "BIRTHDAY":
    case "ANNIVERSARY":
      if (typeof cfg.withinDays !== "number" || cfg.withinDays < 0)
        return { ok: false, reason: "withinDays must be a non-negative number" };
      return { ok: true };
    case "CATEGORY_PURCHASED":
      if (!Array.isArray(cfg.categoryIds) || cfg.categoryIds.length === 0)
        return { ok: false, reason: "Pick at least one category" };
      return { ok: true };
    case "PRODUCT_PURCHASED":
      if (!Array.isArray(cfg.itemIds) || cfg.itemIds.length === 0)
        return { ok: false, reason: "Pick at least one product" };
      return { ok: true };
    case "PAYMENT_METHOD":
      if (!Array.isArray(cfg.methods) || cfg.methods.length === 0)
        return { ok: false, reason: "Pick at least one payment method" };
      return { ok: true };
    case "FIRST_VISIT":
      return { ok: true };
    case "CUSTOM_FIELD":
      if (!cfg.key) return { ok: false, reason: "Custom field key required" };
      return { ok: true };
    default:
      return { ok: false, reason: `Unknown condition ${type}` };
  }
}
