/**
 * Auto-discount engine (audit TASK 12).
 *
 * Picks the SINGLE best matching active auto-discount for a given subtotal +
 * now. Rules in order:
 *  • active === true
 *  • isAuto === true
 *  • validFrom/validTo window covers `now`
 *  • daysOfWeek (CSV like "MON,TUE") contains today
 *  • hourFrom/hourTo (24h) window covers now's hour (inclusive)
 *  • subtotal >= minOrder
 * From the survivors, pick the one with the highest computed savings.
 */
import { db } from "./db";

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export type AutoDiscountHit = {
  id: string;
  code: string;
  name: string;
  type: string;
  amount: number;
};

export async function pickAutoDiscount(opts: {
  outletId: string;
  subtotal: number;
  now?: Date;
}): Promise<AutoDiscountHit | null> {
  const now = opts.now ?? new Date();
  const today = DOW[now.getDay()];
  const hr = now.getHours();

  const rules = await db.discount.findMany({
    where: { outletId: opts.outletId, isAuto: true, active: true },
  });

  const candidates: AutoDiscountHit[] = [];
  for (const r of rules) {
    if (r.minOrder && opts.subtotal < r.minOrder) continue;
    if (r.validFrom && r.validFrom > now) continue;
    if (r.validTo && r.validTo < now) continue;
    if (r.daysOfWeek) {
      const allowed = r.daysOfWeek.split(",").map((d) => d.trim().toUpperCase());
      if (allowed.length && !allowed.includes(today)) continue;
    }
    if (r.hourFrom != null && hr < r.hourFrom) continue;
    if (r.hourTo != null && hr > r.hourTo) continue;

    // Compute the savings this rule would create.
    let amount = 0;
    if (r.type === "FLAT") {
      amount = Math.min(r.value, opts.subtotal);
    } else if (r.type === "PERCENT") {
      amount = (r.value / 100) * opts.subtotal;
      if (r.maxDiscount) amount = Math.min(amount, r.maxDiscount);
    } else if (r.type === "BOGO") {
      // Approximation — half the subtotal up to maxDiscount cap.
      amount = Math.min(opts.subtotal / 2, r.maxDiscount ?? Infinity);
    }
    amount = Math.round(amount);
    if (amount <= 0) continue;
    candidates.push({ id: r.id, code: r.code, name: r.name, type: r.type, amount });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.amount - a.amount);
  return candidates[0];
}
