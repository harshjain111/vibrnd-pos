// Customer Value Engine — OTP challenge service.
//
// Used to gate wallet redemption + Aadhaar verification. bcrypt-hashed
// 6-digit codes, 5-min TTL, 3-attempt cap, throttled to 3 challenges per
// (subject, purpose) in the last 10 minutes.
//
// SMS wiring is intentionally not part of this file — dev returns the
// code in the payload so the SM can read it and forward manually. Prod
// deployments should replace `dispatchOtp` with a real SMS provider call
// and NEVER return the raw code past that boundary.

import "server-only";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export type OtpPurpose = "WALLET_REDEEM" | "AADHAAR_VERIFY" | "CUSTOM";

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 3;
const OTP_RATE_WINDOW_MS = 10 * 60 * 1000;
const OTP_RATE_MAX = 3;
const BCRYPT_ROUNDS = 8;

export type SendOtpInput = {
  purpose: OtpPurpose;
  subjectId: string;
  outletId: string;
  channel?: "sms" | "email";
  /** Masked hint shown to the SM ("•••• 4321"). NEVER pass the full
   * phone / email — we don't want it in DB logs. */
  channelHint?: string;
  metaJson?: string;
};

export type SendOtpResult = {
  challengeId: string;
  channelHint: string | null;
  expiresAt: Date;
  /** Only populated in non-production so the SM can dictate it to the
   * customer while SMS wiring is pending. Never returned in production. */
  devCode?: string;
};

export type VerifyOtpInput = {
  challengeId: string;
  code: string;
};

export type VerifyOtpResult =
  | { ok: true; challengeId: string }
  | { ok: false; reason: "expired" | "attempts_exhausted" | "invalid" | "not_found" | "already_used"; attemptsLeft: number };

// ─── send ──────────────────────────────────────────────────────────────

export async function sendOtp(input: SendOtpInput): Promise<SendOtpResult> {
  if (!input.subjectId) throw new Error("sendOtp: subjectId required");

  // Rate limit: reject if too many recent challenges for this subject.
  const windowStart = new Date(Date.now() - OTP_RATE_WINDOW_MS);
  const recent = await db.otpChallenge.count({
    where: {
      subjectId: input.subjectId,
      purpose: input.purpose,
      createdAt: { gt: windowStart },
    },
  });
  if (recent >= OTP_RATE_MAX) {
    const err = new Error("OTP rate limit — try again in a few minutes");
    (err as any).code = "OTP_RATE_LIMIT";
    throw err;
  }

  const code = randomCode();
  const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  const row = await db.otpChallenge.create({
    data: {
      purpose: input.purpose,
      subjectId: input.subjectId,
      outletId: input.outletId,
      codeHash,
      channel: input.channel ?? null,
      channelHint: input.channelHint ?? null,
      expiresAt,
      metaJson: input.metaJson ?? null,
    },
    select: { id: true, channelHint: true, expiresAt: true },
  });

  await dispatchOtp(input, code);

  return {
    challengeId: row.id,
    channelHint: row.channelHint,
    expiresAt: row.expiresAt,
    ...(process.env.NODE_ENV !== "production" ? { devCode: code } : {}),
  };
}

// ─── verify ────────────────────────────────────────────────────────────

export async function verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResult> {
  const trimmed = String(input.code ?? "").trim();
  if (!/^\d{6}$/.test(trimmed)) {
    // Increment attempt count so a client can't brute-force with malformed input.
    const row = await db.otpChallenge.findUnique({
      where: { id: input.challengeId },
      select: { attempts: true, usedAt: true, expiresAt: true },
    });
    if (!row) return { ok: false, reason: "not_found", attemptsLeft: 0 };
    if (row.usedAt) return { ok: false, reason: "already_used", attemptsLeft: 0 };
    if (row.expiresAt.getTime() < Date.now())
      return { ok: false, reason: "expired", attemptsLeft: 0 };
    await bumpAttempt(input.challengeId, row.attempts);
    const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - (row.attempts + 1));
    if (attemptsLeft <= 0) return { ok: false, reason: "attempts_exhausted", attemptsLeft };
    return { ok: false, reason: "invalid", attemptsLeft };
  }

  return db.$transaction(async (tx) => {
    const row = await tx.otpChallenge.findUnique({
      where: { id: input.challengeId },
      select: { id: true, codeHash: true, expiresAt: true, attempts: true, usedAt: true },
    });
    if (!row) return { ok: false, reason: "not_found", attemptsLeft: 0 } as const;
    if (row.usedAt) return { ok: false, reason: "already_used", attemptsLeft: 0 } as const;
    if (row.expiresAt.getTime() < Date.now())
      return { ok: false, reason: "expired", attemptsLeft: 0 } as const;
    if (row.attempts >= OTP_MAX_ATTEMPTS)
      return { ok: false, reason: "attempts_exhausted", attemptsLeft: 0 } as const;

    const ok = await bcrypt.compare(trimmed, row.codeHash);
    if (!ok) {
      const next = row.attempts + 1;
      await tx.otpChallenge.update({
        where: { id: row.id },
        data: { attempts: next },
      });
      const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - next);
      return {
        ok: false as const,
        reason: attemptsLeft > 0 ? ("invalid" as const) : ("attempts_exhausted" as const),
        attemptsLeft,
      };
    }

    await tx.otpChallenge.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    return { ok: true as const, challengeId: row.id };
  });
}

/** True when the challenge exists, matches purpose and is `usedAt` — the
 * caller (e.g. wallet.debit) checks this AFTER verifyOtp to make sure the
 * OTP was for THIS purpose and hasn't been reused. */
export async function isChallengeConsumed(
  challengeId: string,
  purpose: OtpPurpose,
  subjectId: string,
): Promise<boolean> {
  const row = await db.otpChallenge.findUnique({
    where: { id: challengeId },
    select: { purpose: true, subjectId: true, usedAt: true },
  });
  if (!row) return false;
  return row.purpose === purpose && row.subjectId === subjectId && row.usedAt !== null;
}

// ─── helpers ───────────────────────────────────────────────────────────

async function bumpAttempt(id: string, current: number): Promise<void> {
  await db.otpChallenge.update({
    where: { id },
    data: { attempts: current + 1 },
  });
}

function randomCode(): string {
  // Use crypto.randomInt when available; falls back to Math.random for
  // very old runtimes. Node 18+ has it.
  const g = globalThis as any;
  if (g.crypto?.getRandomValues) {
    const arr = new Uint32Array(1);
    g.crypto.getRandomValues(arr);
    return String(100_000 + (arr[0] % 900_000)).padStart(6, "0");
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Placeholder SMS dispatcher. In production, replace with a Twilio /
 * MSG91 / Kaleyra call and drop the console.log — leaking a raw OTP to
 * server logs is a real leak, not a debug affordance. */
async function dispatchOtp(input: SendOtpInput, code: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[cve/otp] ${input.purpose} → ${input.channelHint ?? input.subjectId}: ${code}`,
    );
  }
  // Intentionally no-op in production until SMS provider is wired.
}
