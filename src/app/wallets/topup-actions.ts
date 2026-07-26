"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { logActivity } from "@/lib/audit";
import { credit } from "@/lib/cve/wallet";

/**
 * "Top-up" is the cashier-facing flow for "customer paid ₹X, wallet
 * gets ₹X + optional bonus". Splits into two ledger rows so the promo
 * side (CAMPAIGN) can expire while the paid side (PREPAID) never does.
 */
const TopupInput = z.object({
  customerId: z.string(),
  amountPaid: z.coerce.number().positive(),
  bonusAmount: z.coerce.number().nonnegative().default(0),
  bonusExpiresInDays: z.coerce.number().int().positive().default(30),
  paymentMode: z.enum(["CASH", "CARD", "UPI", "ONLINE"]).default("CASH"),
  remarks: z.string().max(200).optional(),
});

export type TopupResult =
  | {
      ok: true;
      paidTxId: string;
      bonusTxId: string | null;
      liveBalance: number;
    }
  | { ok: false; error: string };

export async function topUpWalletAction(fd: FormData): Promise<TopupResult> {
  await requireUser("BILLER");
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();

  let parsed;
  try {
    parsed = TopupInput.parse({
      customerId: fd.get("customerId"),
      amountPaid: fd.get("amountPaid"),
      bonusAmount: fd.get("bonusAmount") || 0,
      bonusExpiresInDays: fd.get("bonusExpiresInDays") || 30,
      paymentMode: fd.get("paymentMode") ?? "CASH",
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

  // One idempotency key covers both credits — the second call from a
  // double-click will be a no-op.
  const stamp = Date.now();
  const idemPaid = `topup:paid:${customer.id}:${stamp}`;
  const idemBonus = `topup:bonus:${customer.id}:${stamp}`;

  try {
    // v2 — both paid amount AND recharge bonus land in Cash Wallet.
    // PRD §14 explicitly: "Once credited, the ₹1200 behaves exactly like
    // ordinary wallet balance." Bonus's origin is tracked via sourceKind
    // (RECHARGE_BONUS) so reporting can still split them.
    const paid = await credit({
      customerId: customer.id,
      outletId: outlet.id,
      bucket: "CASH",
      sourceKind: "RECHARGE",
      amount: parsed.amountPaid,
      source: `Top-up ${parsed.paymentMode}`,
      actor: user?.id ?? "system",
      txIdempotencyKey: idemPaid,
      remarks: parsed.remarks || `Paid ${parsed.paymentMode}`,
    });

    let bonusTxId: string | null = null;
    let liveBalance = paid.cachedBalance;
    if (parsed.bonusAmount > 0) {
      const bonus = await credit({
        customerId: customer.id,
        outletId: outlet.id,
        bucket: "CASH",
        sourceKind: "RECHARGE_BONUS",
        amount: parsed.bonusAmount,
        // Bonus keeps its expiry if the admin set one — the ledger row's
        // expiresAt is honoured regardless of bucket.
        expiresInDays: parsed.bonusExpiresInDays,
        source: "Top-up bonus",
        actor: user?.id ?? "system",
        txIdempotencyKey: idemBonus,
        remarks: `Bonus on ₹${parsed.amountPaid} top-up`,
      });
      bonusTxId = bonus.txId;
      liveBalance = bonus.cachedBalance;
    }

    await logActivity({
      action: "CREATE",
      entity: "Customer",
      entityId: customer.id,
      summary: `Wallet top-up: ₹${parsed.amountPaid} paid via ${parsed.paymentMode}${
        parsed.bonusAmount > 0 ? ` + ₹${parsed.bonusAmount} bonus` : ""
      } — ${customer.name}`,
      outletId: outlet.id,
    });

    revalidatePath(`/customers/${customer.id}`);
    revalidatePath("/wallets");
    return { ok: true, paidTxId: paid.txId, bonusTxId, liveBalance };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Top-up failed" };
  }
}
