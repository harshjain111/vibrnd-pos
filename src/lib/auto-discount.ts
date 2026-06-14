/**
 * Auto-discount engine (Discount Phase 2).
 *
 * Picks the SINGLE best matching active discount for a cart at evaluate-time.
 * Every axis from the Vibrnd discount module spec §5 is honored — channel,
 * order type, payment method, scope filter, apply-at, BOGO via DiscountBogo,
 * and time-of-day windows. Coupon-validated discounts are NOT picked here
 * (cashier enters the code at settle); only NONE (auto) and CODE_ONLY rules
 * are surfaced automatically.
 *
 * Rules survive the gauntlet in this order:
 *  • active === true
 *  • validationMode = NONE — gated automatically; CODE_ONLY / COUPON_VALIDATED require a typed code
 *  • channel matches the current bill's channel (POS by default)
 *  • orderType is in the rule's `orderTypes` CSV
 *  • validFrom/validTo window covers `now`
 *  • daysOfWeek (CSV) contains today
 *  • timeFrom/timeTo (HH:MM) — falls back to legacy hourFrom/hourTo when not set
 *  • applyOn = PAYMENT_TYPE → only if the caller passed a paymentMethod and it's whitelisted
 *  • applicableScope (CATEGORIES | ITEMS) — the rule sees only the matching slice of the cart
 *  • minOrder / maxOrder against the eligible-slice subtotal
 *
 * Survivors compute their savings — for PERCENTAGE/FIXED/FIXED_PRICE on the
 * eligible slice (subtotal CORE or grand-total TOTAL depending on applyAt),
 * for BOGO via the DiscountBogo sidecar. Highest amount wins.
 */
import { db } from "./db";

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export type AutoDiscountHit = {
  id: string;
  code: string;
  name: string;
  type: string;
  amount: number;
  /** CORE = applies before tax; TOTAL = applies on grand total. Caller uses
   *  this to decide whether to subtract from `subTotal` or `grandTotal`. */
  applyAt: "CORE" | "TOTAL";
};

/** Cart line passed to the engine. taxRate is optional (only needed when the
 *  rule's applyAt = TOTAL). categoryId enables scope=CATEGORIES filtering. */
export type EvalLine = {
  itemId: string;
  categoryId: string;
  qty: number;
  /** Per-unit price after variant/addon, BEFORE tax. */
  price: number;
  taxRate?: number;
};

export type EvalOpts = {
  outletId: string;
  /** When given, the engine takes the eligible-slice subtotal from the cart
   *  lines that pass the scope filter. When absent (legacy callers), the
   *  whole `subtotal` is used and CATEGORIES/ITEMS rules are skipped. */
  lines?: EvalLine[];
  /** Pre-computed subtotal (CORE). Used as fallback when `lines` is absent
   *  and as the value-vs-min check for whole-bill rules. */
  subtotal: number;
  /** Channel of the bill — POS / ZOMATO / SWIGGY / etc. Defaults to POS so
   *  legacy callers still match POS rules. */
  channel?: string;
  /** Order type — DINE_IN | PICKUP | DELIVERY. Defaults to DINE_IN. */
  orderType?: string;
  /** Selected payment method (cash / card / upi). Only checked against rules
   *  whose applyOn = PAYMENT_TYPE. */
  paymentMethod?: string;
  now?: Date;
};

const HHMM_RE = /^(\d{1,2}):(\d{2})$/;
function inTimeWindow(timeFrom: string | null | undefined, timeTo: string | null | undefined, now: Date): boolean {
  if (!timeFrom && !timeTo) return true;
  const m1 = timeFrom && HHMM_RE.exec(timeFrom);
  const m2 = timeTo && HHMM_RE.exec(timeTo);
  const start = m1 ? parseInt(m1[1], 10) * 60 + parseInt(m1[2], 10) : 0;
  const end = m2 ? parseInt(m2[1], 10) * 60 + parseInt(m2[2], 10) : 24 * 60 - 1;
  const cur = now.getHours() * 60 + now.getMinutes();
  return cur >= start && cur <= end;
}

function csvHas(csv: string | null | undefined, needle: string): boolean {
  if (!csv) return false;
  return csv
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .includes(needle.toUpperCase());
}

function csvOrEmpty(csv: string | null | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Filter the cart down to the lines this discount actually applies to.
 * Returns null when the scope is set but matches nothing (rule disqualified).
 */
function eligibleLines(
  rule: { applicableScope: string; applicableIds: string | null },
  lines: EvalLine[] | undefined
): EvalLine[] | null {
  if (rule.applicableScope === "ALL" || !rule.applicableIds) return lines ?? [];
  if (!lines) return null; // legacy caller — can't filter; skip the rule
  const ids = new Set(csvOrEmpty(rule.applicableIds));
  if (rule.applicableScope === "CATEGORIES") {
    const hit = lines.filter((l) => ids.has(l.categoryId));
    return hit.length > 0 ? hit : null;
  }
  if (rule.applicableScope === "ITEMS") {
    const hit = lines.filter((l) => ids.has(l.itemId));
    return hit.length > 0 ? hit : null;
  }
  return lines;
}

function sliceSubtotal(lines: EvalLine[]): number {
  return lines.reduce((s, l) => s + l.qty * l.price, 0);
}

function sliceGrand(lines: EvalLine[]): number {
  return lines.reduce((s, l) => s + l.qty * l.price * (1 + (l.taxRate ?? 0) / 100), 0);
}

/**
 * BOGO computation against the sidecar DiscountBogo row. Buy-side and Get-side
 * filters narrow the eligible lines independently. The picker walks the cart
 * in chunks of buyQty + getQty so a 2-for-1 on a multi-line cart correctly
 * discounts every Nth+1 unit. Get-side pricing strategy controls which units
 * are considered "free" — LOWER (best for guest), HIGHER (best for the house),
 * SAME (Get must be the same SKU as Buy).
 */
function computeBogo(
  rule: { value: number; maxDiscount: number | null },
  bogo: {
    itemAmountMin: number | null;
    buyScope: string;
    buyScopeIds: string | null;
    getScope: string;
    getScopeIds: string | null;
    buyQty: number;
    getQty: number;
    bogoValueType: string;
    bogoValue: number;
    getItemPricing: string;
  },
  cart: EvalLine[]
): number {
  // Buy-side eligibility — expand by qty into a flat list of unit prices so
  // we can match them one for one against Get-side picks.
  const expand = (scope: string, ids: string | null, lines: EvalLine[]) => {
    let pool = lines;
    if (scope !== "ALL" && ids) {
      const set = new Set(csvOrEmpty(ids));
      pool = lines.filter((l) =>
        scope === "CATEGORIES" ? set.has(l.categoryId) : scope === "ITEMS" ? set.has(l.itemId) : true
      );
    }
    const units: { itemId: string; price: number }[] = [];
    for (const l of pool) for (let i = 0; i < l.qty; i++) units.push({ itemId: l.itemId, price: l.price });
    return units;
  };

  const buyUnits = expand(bogo.buyScope, bogo.buyScopeIds, cart);
  const getUnits = expand(bogo.getScope, bogo.getScopeIds, cart);
  if (buyUnits.length < bogo.buyQty || getUnits.length === 0) return 0;
  if (bogo.itemAmountMin && sliceSubtotal(cart) < bogo.itemAmountMin) return 0;

  // SAME: get must be the same SKU as the buy unit it pairs with. Otherwise
  // sort get-units by price asc (LOWER → free the cheapest = best guest deal)
  // or desc (HIGHER → free the priciest = clearance).
  let pool = [...getUnits];
  if (bogo.getItemPricing === "HIGHER") pool.sort((a, b) => b.price - a.price);
  else pool.sort((a, b) => a.price - b.price); // LOWER + SAME default

  let saved = 0;
  // Determine how many "free" units we can grant: floor(buyUnits / buyQty) * getQty,
  // bounded by what's left in the get pool.
  const cycles = Math.floor(buyUnits.length / bogo.buyQty);
  const freeUnitCount = Math.min(cycles * bogo.getQty, pool.length);

  for (let i = 0; i < freeUnitCount; i++) {
    const u = pool[i];
    if (bogo.getItemPricing === "SAME") {
      // Skip if no buy unit shares this SKU — pair by SKU only.
      const matched = buyUnits.some((b) => b.itemId === u.itemId);
      if (!matched) continue;
    }
    const off = bogo.bogoValueType === "FIXED" ? Math.min(u.price, bogo.bogoValue) : (u.price * bogo.bogoValue) / 100;
    saved += off;
  }
  if (rule.maxDiscount) saved = Math.min(saved, rule.maxDiscount);
  return Math.round(saved);
}

export async function pickAutoDiscount(opts: EvalOpts): Promise<AutoDiscountHit | null> {
  const now = opts.now ?? new Date();
  const today = DOW[now.getDay()];
  const channel = (opts.channel ?? "POS").toUpperCase();
  const orderType = (opts.orderType ?? "DINE_IN").toUpperCase();

  // Pull every candidate up front — Phase 2 surface is too wide to push
  // every predicate into Prisma. The list per outlet is small (<100 rules).
  // Coupon-validated rules are excluded since they need a typed code.
  const rules = await db.discount.findMany({
    where: {
      outletId: opts.outletId,
      active: true,
      OR: [{ isAuto: true }, { validationMode: "NONE" }],
      validationMode: { not: "COUPON_VALIDATED" },
    },
    include: { bogo: true },
  });

  const candidates: AutoDiscountHit[] = [];

  for (const r of rules) {
    // Channel / order-type / payment-method gating — none of these compute
    // a discount, they just decide whether the rule fires at all.
    if (r.channel && r.channel !== channel) continue;
    if (r.orderTypes && !csvHas(r.orderTypes, orderType)) continue;
    if (r.applyOn === "PAYMENT_TYPE") {
      if (!opts.paymentMethod) continue; // mode not chosen yet → skip in preview
      if (!csvHas(r.paymentMethods, opts.paymentMethod)) continue;
    }

    // Time / day window.
    if (r.validFrom && r.validFrom > now) continue;
    if (r.validTo && r.validTo < now) continue;
    if (r.daysOfWeek) {
      const allowed = r.daysOfWeek.split(",").map((d) => d.trim().toUpperCase());
      if (allowed.length && !allowed.includes(today)) continue;
    }
    if (r.timeFrom || r.timeTo) {
      if (!inTimeWindow(r.timeFrom, r.timeTo, now)) continue;
    } else if (r.hourFrom != null || r.hourTo != null) {
      // Legacy integer-hour window — kept for back-compat with rows seeded
      // before the timeFrom/timeTo migration.
      const hr = now.getHours();
      if (r.hourFrom != null && hr < r.hourFrom) continue;
      if (r.hourTo != null && hr > r.hourTo) continue;
    }

    // Scope filter — narrows the eligible-slice for min-order check + applyAt
    // computation. ALL = whole bill.
    const eligible = eligibleLines(r, opts.lines);
    if (eligible === null) continue;

    const sliceSub = eligible.length > 0 ? sliceSubtotal(eligible) : opts.subtotal;
    if (r.minOrder && sliceSub < r.minOrder) continue;
    if (r.maxOrder && sliceSub > r.maxOrder) continue;

    // Apply-at TOTAL means we discount the post-tax grand total of the
    // eligible slice. Without tax-aware lines we fall back to subtotal.
    const sliceVal =
      r.applyAt === "TOTAL" && eligible.length > 0 && eligible.some((l) => l.taxRate != null)
        ? sliceGrand(eligible)
        : sliceSub;

    let amount = 0;
    const t = r.type;
    if (t === "FIXED" || t === "FLAT") {
      amount = Math.min(r.value, sliceVal);
    } else if (t === "PERCENTAGE" || t === "PERCENT") {
      amount = (r.value / 100) * sliceVal;
      if (r.maxDiscount) amount = Math.min(amount, r.maxDiscount);
    } else if (t === "BOGO" && r.bogo) {
      amount = computeBogo(r, r.bogo, eligible);
    } else if (t === "BOGO") {
      // Sidecar missing — fall back to the old 50% approximation so legacy
      // rows still produce something rather than zero. Owner should re-save
      // the rule via the new form to populate DiscountBogo.
      amount = Math.min(sliceVal / 2, r.maxDiscount ?? Infinity);
    } else if (t === "FIXED_PRICE") {
      amount = Math.max(0, sliceVal - r.value);
    }
    amount = Math.round(amount);
    if (amount <= 0) continue;

    candidates.push({
      id: r.id,
      code: r.code,
      name: r.name,
      type: r.type,
      amount,
      applyAt: r.applyAt === "TOTAL" ? "TOTAL" : "CORE",
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.amount - a.amount);
  return candidates[0];
}
