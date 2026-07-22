// Customer Value Engine — wallet service (DB-backed).
//
// Public contract:
//   • getOrCreateAccount(customerId, outletId)
//   • getBalance(customerId) → derived from live CREDIT rows, NOT
//     cachedBalance. cachedBalance is a fast-read denorm kept for the
//     CRM chip / dashboard list; never used for enforcement.
//   • credit(...)  — writes ONE CREDIT row, idempotent on
//                    (accountId, txIdempotencyKey)
//   • debit(...)   — locks the account, applies FIFO across live
//                    credits, writes ONE DEBIT + updates draws
//   • expireStaleCredits(now) — daily cron entrypoint
//   • bucketBreakdown(customerId) — for the wallet tab UI
//   • history(customerId, limit) — for the wallet tab UI
//
// All mutations happen inside a $transaction with an advisory lock on
// the WalletAccount id, so concurrent debits/credits from separate
// requests serialise cleanly.

import "server-only";
import { db } from "@/lib/db";
import type { Prisma, PrismaClient } from "@prisma/client";
import { BUCKET_PRIORITY, type WalletBucket } from "./types";
import {
  type Candidate,
  liveOnly,
  selectExpiringCredits,
  selectFifoCredits,
} from "./wallet-fifo";

type Tx = Prisma.TransactionClient;

const ADVISORY_NS = 918273; // wallet-service namespace for pg_advisory_xact_lock

// ─── account bootstrap ─────────────────────────────────────────────────

async function ensureAccount(
  tx: Tx,
  customerId: string,
  outletId: string,
) {
  const existing = await tx.walletAccount.findUnique({ where: { customerId } });
  if (existing) return existing;
  return tx.walletAccount.create({
    data: { customerId, outletId, cachedBalance: 0 },
  });
}

/** Take a pg advisory lock scoped to this wallet account so credit/debit
 * from separate requests can't interleave and double-spend. Released on
 * transaction commit/rollback. */
async function lockAccount(tx: Tx, accountId: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${ADVISORY_NS}::int, hashtext(${accountId}))`;
}

export async function getOrCreateAccount(
  customerId: string,
  outletId: string,
): Promise<{ id: string; customerId: string; outletId: string; cachedBalance: number }> {
  return db.$transaction(async (tx) => {
    const acc = await ensureAccount(tx, customerId, outletId);
    return {
      id: acc.id,
      customerId: acc.customerId,
      outletId: acc.outletId,
      cachedBalance: acc.cachedBalance,
    };
  });
}

// ─── balance readers ───────────────────────────────────────────────────

/** Live balance = sum of remaining across non-expired CREDIT rows.
 * ⚠ Never trust cachedBalance for enforcement — always call this. */
export async function getBalance(customerId: string, at: Date = new Date()): Promise<number> {
  const account = await db.walletAccount.findUnique({ where: { customerId }, select: { id: true } });
  if (!account) return 0;
  const rows = await db.walletTransaction.findMany({
    where: {
      walletAccountId: account.id,
      type: "CREDIT",
      remaining: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: at } }],
    },
    select: { remaining: true },
  });
  return round2(rows.reduce((s, r) => s + r.remaining, 0));
}

/** Per-bucket live balance for the wallet tab UI. Returns a fixed
 * dictionary shape so the UI always has every bucket key. */
export async function bucketBreakdown(
  customerId: string,
  at: Date = new Date(),
): Promise<Record<WalletBucket, number>> {
  const out: Record<WalletBucket, number> = Object.fromEntries(
    BUCKET_PRIORITY.map((b) => [b, 0] as const),
  ) as Record<WalletBucket, number>;
  const account = await db.walletAccount.findUnique({ where: { customerId }, select: { id: true } });
  if (!account) return out;
  const rows = await db.walletTransaction.findMany({
    where: {
      walletAccountId: account.id,
      type: "CREDIT",
      remaining: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: at } }],
    },
    select: { bucket: true, remaining: true },
  });
  for (const r of rows) {
    const b = (r.bucket as WalletBucket) ?? "MANUAL";
    if (out[b] == null) continue; // ignore unknown buckets (forward-compat)
    out[b] = round2(out[b] + r.remaining);
  }
  return out;
}

export async function history(customerId: string, take = 50) {
  const account = await db.walletAccount.findUnique({ where: { customerId }, select: { id: true } });
  if (!account) return [];
  return db.walletTransaction.findMany({
    where: { walletAccountId: account.id },
    orderBy: { createdAt: "desc" },
    take,
  });
}

// ─── credit ────────────────────────────────────────────────────────────

export type CreditInput = {
  customerId: string;
  outletId: string;
  bucket: WalletBucket;
  amount: number;
  source: string;
  expiresInDays?: number;
  campaignId?: string;
  membershipId?: string;
  orderId?: string;
  actor?: string;
  txIdempotencyKey: string;
  remarks?: string;
};

export type CreditResult = {
  txId: string;
  amount: number;
  cachedBalance: number;
  duplicated: boolean;
};

export async function credit(input: CreditInput): Promise<CreditResult> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("credit: amount must be > 0");
  }
  if (!input.txIdempotencyKey) {
    throw new Error("credit: txIdempotencyKey required");
  }
  const amt = round2(input.amount);
  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 86400_000)
      : null;

  return db.$transaction(async (tx) => {
    const account = await ensureAccount(tx, input.customerId, input.outletId);
    await lockAccount(tx, account.id);

    const dupe = await tx.walletTransaction.findFirst({
      where: { walletAccountId: account.id, txIdempotencyKey: input.txIdempotencyKey },
      select: { id: true, amount: true },
    });
    if (dupe) {
      const cached = await recomputeCachedBalance(tx, account.id);
      return {
        txId: dupe.id,
        amount: dupe.amount,
        cachedBalance: cached,
        duplicated: true,
      };
    }

    const row = await tx.walletTransaction.create({
      data: {
        walletAccountId: account.id,
        type: "CREDIT",
        bucket: input.bucket,
        amount: amt,
        remaining: amt,
        expiresAt,
        source: input.source,
        campaignId: input.campaignId,
        membershipId: input.membershipId,
        orderId: input.orderId,
        actor: input.actor ?? "system",
        outletId: input.outletId,
        remarks: input.remarks,
        txIdempotencyKey: input.txIdempotencyKey,
      },
      select: { id: true },
    });

    const cached = await recomputeCachedBalance(tx, account.id);
    return { txId: row.id, amount: amt, cachedBalance: cached, duplicated: false };
  });
}

// ─── debit ─────────────────────────────────────────────────────────────

export type DebitInput = {
  customerId: string;
  outletId: string;
  amount: number;
  source: string;
  orderId?: string;
  actor: string;
  txIdempotencyKey: string;
  remarks?: string;
};

export type DebitResult = {
  txId: string;
  amount: number;
  draws: { creditTxId: string; take: number; bucket: WalletBucket }[];
  cachedBalance: number;
  duplicated: boolean;
};

/** Attempt to debit `amount` off the customer's wallet using FIFO. Throws
 * WalletShortfallError if the wallet can't cover it — the caller decides
 * whether to charge the rest through a payment mode. */
export class WalletShortfallError extends Error {
  constructor(public available: number, public requested: number) {
    super(`Wallet has ₹${available.toFixed(2)}, needed ₹${requested.toFixed(2)}`);
    this.name = "WalletShortfallError";
  }
}

export async function debit(input: DebitInput): Promise<DebitResult> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("debit: amount must be > 0");
  }
  if (!input.txIdempotencyKey) {
    throw new Error("debit: txIdempotencyKey required");
  }
  const amt = round2(input.amount);

  return db.$transaction(async (tx) => {
    const account = await ensureAccount(tx, input.customerId, input.outletId);
    await lockAccount(tx, account.id);

    const dupe = await tx.walletTransaction.findFirst({
      where: { walletAccountId: account.id, txIdempotencyKey: input.txIdempotencyKey },
      select: { id: true, amount: true, drawsFromJson: true },
    });
    if (dupe) {
      const cached = await recomputeCachedBalance(tx, account.id);
      const draws = safeParseDraws(dupe.drawsFromJson);
      return {
        txId: dupe.id,
        amount: dupe.amount,
        draws,
        cachedBalance: cached,
        duplicated: true,
      };
    }

    const now = new Date();
    const rows = await tx.walletTransaction.findMany({
      where: { walletAccountId: account.id, type: "CREDIT", remaining: { gt: 0 } },
      select: {
        id: true,
        bucket: true,
        remaining: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    const candidates: Candidate[] = rows.map((r) => ({
      id: r.id,
      bucket: (r.bucket as WalletBucket) ?? "MANUAL",
      remaining: r.remaining,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }));
    const live = liveOnly(candidates, now);
    const available = round2(live.reduce((s, c) => s + c.remaining, 0));
    if (available < amt) {
      throw new WalletShortfallError(available, amt);
    }

    const result = selectFifoCredits(live, amt, now);
    if (result.shortfall > 0) {
      throw new WalletShortfallError(available, amt);
    }

    // Decrement each drawn credit's remaining, then write the DEBIT row.
    for (const d of result.draws) {
      await tx.walletTransaction.update({
        where: { id: d.creditTxId },
        data: { remaining: { decrement: d.take } },
      });
    }

    const debitRow = await tx.walletTransaction.create({
      data: {
        walletAccountId: account.id,
        type: "DEBIT",
        // Bucket on a DEBIT is the primary source bucket — the largest
        // draw. Purely informational (analytics-friendly).
        bucket: pickPrimaryBucket(result.draws),
        amount: amt,
        remaining: 0,
        source: input.source,
        orderId: input.orderId,
        actor: input.actor,
        outletId: input.outletId,
        remarks: input.remarks,
        txIdempotencyKey: input.txIdempotencyKey,
        drawsFromJson: JSON.stringify(result.draws),
      },
      select: { id: true },
    });

    const cached = await recomputeCachedBalance(tx, account.id);
    return {
      txId: debitRow.id,
      amount: amt,
      draws: result.draws,
      cachedBalance: cached,
      duplicated: false,
    };
  });
}

// ─── expiry cron ───────────────────────────────────────────────────────

/** Sweep expired credits and write a bucket-scoped DEBIT of source=EXPIRY
 * for each. Idempotent per (accountId, credit id) so the daily cron can
 * re-run safely. */
export async function expireStaleCredits(now: Date = new Date()): Promise<{ swept: number; total: number }> {
  const rows = await db.walletTransaction.findMany({
    where: {
      type: "CREDIT",
      remaining: { gt: 0 },
      expiresAt: { lte: now },
    },
    select: {
      id: true,
      walletAccountId: true,
      remaining: true,
      bucket: true,
      outletId: true,
      expiresAt: true,
      createdAt: true,
    },
    take: 500, // batch guard for the daily cron
  });

  let swept = 0;
  let total = 0;
  for (const r of rows) {
    const idem = `expiry:${r.id}`;
    try {
      await db.$transaction(async (tx) => {
        await lockAccount(tx, r.walletAccountId);
        const dupe = await tx.walletTransaction.findFirst({
          where: { walletAccountId: r.walletAccountId, txIdempotencyKey: idem },
          select: { id: true },
        });
        if (dupe) return;
        const live = await tx.walletTransaction.findUnique({
          where: { id: r.id },
          select: { remaining: true },
        });
        if (!live || live.remaining <= 0) return;
        const take = round2(live.remaining);
        await tx.walletTransaction.update({
          where: { id: r.id },
          data: { remaining: { decrement: take } },
        });
        await tx.walletTransaction.create({
          data: {
            walletAccountId: r.walletAccountId,
            type: "DEBIT",
            bucket: r.bucket,
            amount: take,
            remaining: 0,
            source: "EXPIRY",
            actor: "cron:expiry",
            outletId: r.outletId,
            drawsFromJson: JSON.stringify([{ creditTxId: r.id, take, bucket: r.bucket }]),
            txIdempotencyKey: idem,
          },
        });
        await recomputeCachedBalance(tx, r.walletAccountId);
        swept++;
        total = round2(total + take);
      });
    } catch (err) {
      console.error("expireStaleCredits failed for", r.id, err);
    }
  }
  return { swept, total };
}

/** Read-only preview of what would expire before `cutoff`. Used by the
 * "expiring soon" banner in the wallet tab. */
export async function listExpiringSoon(customerId: string, cutoff: Date) {
  const account = await db.walletAccount.findUnique({
    where: { customerId },
    select: { id: true },
  });
  if (!account) return [];
  const rows = await db.walletTransaction.findMany({
    where: {
      walletAccountId: account.id,
      type: "CREDIT",
      remaining: { gt: 0 },
      expiresAt: { not: null, lte: cutoff },
    },
    orderBy: { expiresAt: "asc" },
  });
  const candidates: Candidate[] = rows.map((r) => ({
    id: r.id,
    bucket: (r.bucket as WalletBucket) ?? "MANUAL",
    remaining: r.remaining,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  }));
  return selectExpiringCredits(candidates, cutoff);
}

// ─── helpers ───────────────────────────────────────────────────────────

async function recomputeCachedBalance(tx: Tx, accountId: string): Promise<number> {
  const now = new Date();
  const rows = await tx.walletTransaction.findMany({
    where: {
      walletAccountId: accountId,
      type: "CREDIT",
      remaining: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { remaining: true },
  });
  const bal = round2(rows.reduce((s, r) => s + r.remaining, 0));
  await tx.walletAccount.update({
    where: { id: accountId },
    data: { cachedBalance: bal },
  });
  return bal;
}

function pickPrimaryBucket(draws: { bucket: WalletBucket; take: number }[]): WalletBucket {
  if (draws.length === 0) return "MANUAL";
  const totals = new Map<WalletBucket, number>();
  for (const d of draws) totals.set(d.bucket, (totals.get(d.bucket) ?? 0) + d.take);
  let best: WalletBucket = draws[0].bucket;
  let bestVal = -1;
  for (const [b, v] of totals) {
    if (v > bestVal) {
      best = b;
      bestVal = v;
    }
  }
  return best;
}

function safeParseDraws(json: string | null): DebitResult["draws"] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr as DebitResult["draws"];
  } catch {
    return [];
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Type check that PrismaClient is imported (avoids unused import warning
// while keeping the type in scope for callers reading this file).
type _P = PrismaClient;
