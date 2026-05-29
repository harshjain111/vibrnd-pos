import { db } from "./db";

type RecordInput = {
  customerId: string;
  outletId: string;
  delta: number; // positive earn, negative redeem
  reason: "EARN" | "REDEEM" | "ADJUST" | "EXPIRE";
  orderId?: string;
  note?: string;
};

export async function recordLoyalty(input: RecordInput) {
  if (input.delta === 0) return;
  const c = await db.customer.findUnique({ where: { id: input.customerId } });
  if (!c) return;
  const newBalance = Math.max(0, c.loyaltyPoints + input.delta);
  const actualDelta = newBalance - c.loyaltyPoints; // safe clamp
  if (actualDelta === 0) return;

  await db.customer.update({
    where: { id: input.customerId },
    data: { loyaltyPoints: newBalance },
  });

  await db.loyaltyTransaction.create({
    data: {
      customerId: input.customerId,
      delta: actualDelta,
      balance: newBalance,
      reason: input.reason,
      orderId: input.orderId,
      note: input.note,
      outletId: input.outletId,
    },
  });
}

export function pointsEarned(grandTotal: number, earnPer: number): number {
  if (earnPer <= 0) return 0;
  return Math.floor(grandTotal / earnPer);
}

export function redeemValue(points: number, rupeesPerPoint: number): number {
  if (rupeesPerPoint <= 0 || points <= 0) return 0;
  return Math.round(points * rupeesPerPoint);
}

export type LoyaltyTier = "BRONZE" | "SILVER" | "GOLD";

export type TierConfig = {
  silverAt: number;
  goldAt: number;
  silverMult: number;
  goldMult: number;
};

export function tierFor(points: number, cfg: TierConfig): LoyaltyTier {
  if (points >= cfg.goldAt) return "GOLD";
  if (points >= cfg.silverAt) return "SILVER";
  return "BRONZE";
}

export function earnMultiplier(tier: LoyaltyTier, cfg: TierConfig): number {
  if (tier === "GOLD") return cfg.goldMult;
  if (tier === "SILVER") return cfg.silverMult;
  return 1;
}

export const TIER_TONE: Record<LoyaltyTier, "secondary" | "info" | "warning"> = {
  BRONZE: "secondary",
  SILVER: "info",
  GOLD: "warning",
};
