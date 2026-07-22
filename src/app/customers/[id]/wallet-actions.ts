"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { logActivity } from "@/lib/audit";
import { credit, debit, WalletShortfallError } from "@/lib/cve/wallet";
import { sendOtp, verifyOtp, isChallengeConsumed } from "@/lib/cve/otp";
import { WALLET_BUCKETS, type WalletBucket } from "@/lib/cve/types";

const CreditInput = z.object({
  customerId: z.string(),
  amount: z.coerce.number().positive(),
  bucket: z.enum(WALLET_BUCKETS).default("MANUAL"),
  remarks: z.string().max(200).optional(),
  expiresInDays: z.coerce.number().int().positive().optional(),
});

export type WalletCreditResult =
  | { ok: true; txId: string; cachedBalance: number; duplicated: boolean }
  | { ok: false; error: string };

export async function creditWalletAction(fd: FormData): Promise<WalletCreditResult> {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  let parsed;
  try {
    parsed = CreditInput.parse({
      customerId: fd.get("customerId"),
      amount: fd.get("amount"),
      bucket: fd.get("bucket") ?? "MANUAL",
      remarks: (fd.get("remarks") as string) || undefined,
      expiresInDays: (fd.get("expiresInDays") as string) || undefined,
    });
  } catch (err: any) {
    return { ok: false, error: err?.issues?.[0]?.message ?? "Invalid input" };
  }
  const customer = await db.customer.findFirst({
    where: { id: parsed.customerId, outletId: outlet.id },
    select: { id: true, name: true },
  });
  if (!customer) return { ok: false, error: "Customer not found" };
  try {
    const idem = `manual:${customer.id}:${Date.now()}:${user?.id ?? "system"}`;
    const res = await credit({
      customerId: customer.id,
      outletId: outlet.id,
      bucket: parsed.bucket as WalletBucket,
      amount: parsed.amount,
      source: "MANUAL",
      expiresInDays: parsed.expiresInDays,
      actor: user?.id ?? "system",
      txIdempotencyKey: idem,
      remarks: parsed.remarks,
    });
    await logActivity({
      action: "CREATE",
      entity: "Customer",
      entityId: customer.id,
      summary: `Wallet credit ₹${parsed.amount} to ${customer.name} (${parsed.bucket})`,
      outletId: outlet.id,
    });
    revalidatePath(`/customers/${customer.id}`);
    return { ok: true, txId: res.txId, cachedBalance: res.cachedBalance, duplicated: res.duplicated };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Credit failed" };
  }
}

// ─── OTP-gated redemption ──────────────────────────────────────────────

const RequestOtpInput = z.object({
  customerId: z.string(),
  amount: z.coerce.number().positive(),
});

export type WalletRequestOtpResult =
  | {
      ok: true;
      challengeId: string;
      channelHint: string | null;
      expiresAt: string;
      devCode?: string;
    }
  | { ok: false; error: string };

export async function requestWalletRedeemOtpAction(
  fd: FormData,
): Promise<WalletRequestOtpResult> {
  await requireUser("BILLER");
  const outlet = await getActiveOutlet();
  let parsed;
  try {
    parsed = RequestOtpInput.parse({
      customerId: fd.get("customerId"),
      amount: fd.get("amount"),
    });
  } catch (err: any) {
    return { ok: false, error: err?.issues?.[0]?.message ?? "Invalid input" };
  }
  const customer = await db.customer.findFirst({
    where: { id: parsed.customerId, outletId: outlet.id },
    select: { id: true, phone: true },
  });
  if (!customer) return { ok: false, error: "Customer not found" };
  const hint = customer.phone
    ? `•••• ${customer.phone.slice(-4)}`
    : "customer's registered channel";
  try {
    const r = await sendOtp({
      purpose: "WALLET_REDEEM",
      subjectId: customer.id,
      outletId: outlet.id,
      channel: "sms",
      channelHint: hint,
      metaJson: JSON.stringify({ amount: parsed.amount }),
    });
    return {
      ok: true,
      challengeId: r.challengeId,
      channelHint: r.channelHint,
      expiresAt: r.expiresAt.toISOString(),
      devCode: r.devCode,
    };
  } catch (err: any) {
    if (err?.code === "OTP_RATE_LIMIT") {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: err?.message ?? "OTP send failed" };
  }
}

const RedeemInput = z.object({
  customerId: z.string(),
  amount: z.coerce.number().positive(),
  challengeId: z.string(),
  code: z.string().length(6),
  remarks: z.string().max(200).optional(),
});

export type WalletRedeemResult =
  | { ok: true; txId: string; cachedBalance: number }
  | { ok: false; error: string };

export async function redeemWalletAction(fd: FormData): Promise<WalletRedeemResult> {
  await requireUser("BILLER");
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  let parsed;
  try {
    parsed = RedeemInput.parse({
      customerId: fd.get("customerId"),
      amount: fd.get("amount"),
      challengeId: fd.get("challengeId"),
      code: fd.get("code"),
      remarks: (fd.get("remarks") as string) || undefined,
    });
  } catch (err: any) {
    return { ok: false, error: err?.issues?.[0]?.message ?? "Invalid input" };
  }
  const customer = await db.customer.findFirst({
    where: { id: parsed.customerId, outletId: outlet.id },
    select: { id: true, name: true },
  });
  if (!customer) return { ok: false, error: "Customer not found" };

  // 1. Verify + consume the OTP. Never trust a challengeId that wasn't
  //    matched by verifyOtp for THIS customer + purpose.
  const verify = await verifyOtp({ challengeId: parsed.challengeId, code: parsed.code });
  if (!verify.ok) return { ok: false, error: `OTP: ${verify.reason}` };
  const bound = await isChallengeConsumed(parsed.challengeId, "WALLET_REDEEM", customer.id);
  if (!bound) return { ok: false, error: "OTP not for this customer" };

  try {
    const idem = `redeem:${customer.id}:${parsed.challengeId}`;
    const res = await debit({
      customerId: customer.id,
      outletId: outlet.id,
      amount: parsed.amount,
      source: "MANUAL_REDEEM",
      actor: user?.id ?? "system",
      txIdempotencyKey: idem,
      remarks: parsed.remarks,
    });
    await logActivity({
      action: "UPDATE",
      entity: "Customer",
      entityId: customer.id,
      summary: `Wallet redeem ₹${parsed.amount} for ${customer.name}`,
      outletId: outlet.id,
    });
    revalidatePath(`/customers/${customer.id}`);
    return { ok: true, txId: res.txId, cachedBalance: res.cachedBalance };
  } catch (err: any) {
    if (err instanceof WalletShortfallError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: err?.message ?? "Redeem failed" };
  }
}
