// Customer Value Engine — FIFO bucket selection (pure).
//
// This module decides WHICH credit rows a debit consumes, and in WHAT
// order. Kept pure so the ordering policy is testable + auditable in
// isolation. The DB wrapper (wallet.ts) just:
//   1. loads live CREDIT rows,
//   2. calls selectFifoCredits(rows, requested, now),
//   3. writes the returned draws atomically.
//
// Ordering policy (PRD "Expiring balance → CAMPAIGN → CASHBACK → …"):
//   1. Credits with an expiresAt come before those without (expiring
//      balance always leaves first — otherwise it burns).
//   2. Among two credits with expiresAt, the earlier expiresAt wins.
//   3. Ties fall to WALLET bucket priority (CAMPAIGN … MANUAL).
//   4. Final tie-break: createdAt ascending (older credit first).

import { BUCKET_PRIORITY, type WalletBucket } from "./types";

export type Candidate = {
  id: string;
  bucket: WalletBucket;
  remaining: number;
  expiresAt: Date | null;
  createdAt: Date;
};

export type Draw = {
  creditTxId: string;
  take: number;
  bucket: WalletBucket;
};

export type FifoResult = {
  draws: Draw[];
  /** Rupee value the wallet could satisfy from live credits — may be less
   * than the requested amount when the wallet is short. Callers refuse
   * partial fills at the service layer. */
  taken: number;
  /** Shortfall (requested − taken). 0 when the wallet fully covered it. */
  shortfall: number;
};

/** Stable ordering for FIFO selection. */
export function orderCandidates(rows: Candidate[]): Candidate[] {
  const rank = (b: WalletBucket) => {
    const i = BUCKET_PRIORITY.indexOf(b);
    return i < 0 ? BUCKET_PRIORITY.length : i;
  };
  return rows.slice().sort((a, b) => {
    // Expiring balance leaves first.
    const aExp = a.expiresAt ? a.expiresAt.getTime() : Infinity;
    const bExp = b.expiresAt ? b.expiresAt.getTime() : Infinity;
    if (aExp !== bExp) return aExp - bExp;
    // Bucket priority.
    const r = rank(a.bucket) - rank(b.bucket);
    if (r !== 0) return r;
    // Older credit first.
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/** Filter out credits that are already expired or exhausted. `now` is
 * passed in so tests can control the clock. */
export function liveOnly(rows: Candidate[], now: Date): Candidate[] {
  const t = now.getTime();
  return rows.filter(
    (r) => r.remaining > 0 && (!r.expiresAt || r.expiresAt.getTime() > t),
  );
}

/** Pick which credits satisfy the requested rupee amount and how much
 * each contributes. `amount` must be > 0; rounds each draw to 2 dp so
 * fractional rupees don't strand. */
export function selectFifoCredits(
  rows: Candidate[],
  amount: number,
  now: Date,
): FifoResult {
  if (amount <= 0) return { draws: [], taken: 0, shortfall: 0 };
  const live = orderCandidates(liveOnly(rows, now));
  const draws: Draw[] = [];
  let remaining = round2(amount);
  for (const c of live) {
    if (remaining <= 0) break;
    const take = round2(Math.min(remaining, c.remaining));
    if (take <= 0) continue;
    draws.push({ creditTxId: c.id, take, bucket: c.bucket });
    remaining = round2(remaining - take);
  }
  const taken = round2(amount - remaining);
  return { draws, taken, shortfall: round2(remaining) };
}

/** Which credits are expiring on/before `cutoff` and can no longer be
 * consumed after that moment. Used by the daily expiry cron. */
export function selectExpiringCredits(
  rows: Candidate[],
  cutoff: Date,
): Candidate[] {
  return rows.filter(
    (r) => r.remaining > 0 && r.expiresAt && r.expiresAt.getTime() <= cutoff.getTime(),
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
