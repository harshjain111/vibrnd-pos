-- Discount module v2 — extends the existing Discount table with the full
-- Vibrnd spec (channel, order types, scope, validation mode, etc.) and
-- adds the three new side tables: DiscountBogo (1:1 with BOGO discounts),
-- Coupon master + redemption ledger, and DiscountUsage audit rows.
--
-- The migration is non-destructive: every existing discount row keeps
-- working. We just normalise the `type` enum (FLAT → FIXED, PERCENT →
-- PERCENTAGE) and derive a sensible `validationMode` from `isAuto` so the
-- new UI defaults match how the row was created originally.

-- 1) New scalar columns on Discount. All have safe defaults so existing
--    rows fill in automatically — no NOT NULL violations.
ALTER TABLE "Discount" ADD COLUMN "maxOrder" DOUBLE PRECISION;
ALTER TABLE "Discount" ADD COLUMN "timeFrom" TEXT;
ALTER TABLE "Discount" ADD COLUMN "timeTo" TEXT;
ALTER TABLE "Discount" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'POS';
ALTER TABLE "Discount" ADD COLUMN "orderTypes" TEXT NOT NULL DEFAULT 'DELIVERY,PICKUP,DINE_IN';
ALTER TABLE "Discount" ADD COLUMN "applyOn" TEXT NOT NULL DEFAULT 'AMOUNT';
ALTER TABLE "Discount" ADD COLUMN "paymentMethods" TEXT;
ALTER TABLE "Discount" ADD COLUMN "applyAt" TEXT NOT NULL DEFAULT 'CORE';
ALTER TABLE "Discount" ADD COLUMN "applicableScope" TEXT NOT NULL DEFAULT 'ALL';
ALTER TABLE "Discount" ADD COLUMN "applicableIds" TEXT;
ALTER TABLE "Discount" ADD COLUMN "validationMode" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Discount" ADD COLUMN "description" TEXT;
ALTER TABLE "Discount" ADD COLUMN "terms" TEXT;
ALTER TABLE "Discount" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2) Backfill: normalise the legacy type enum + map isAuto → validationMode.
--    Done in a single statement per column so it's idempotent if the
--    migration retries.
UPDATE "Discount" SET "type" = 'FIXED' WHERE "type" = 'FLAT';
UPDATE "Discount" SET "type" = 'PERCENTAGE' WHERE "type" = 'PERCENT';
UPDATE "Discount" SET "validationMode" = CASE WHEN "isAuto" = TRUE THEN 'NONE' ELSE 'CODE_ONLY' END;

-- 3) Time-of-day backfill. Old engine used integer hourFrom/hourTo; the
--    new form uses HH:MM strings. Convert when both ends are set.
UPDATE "Discount"
   SET "timeFrom" = LPAD("hourFrom"::text, 2, '0') || ':00',
       "timeTo"   = LPAD("hourTo"::text,   2, '0') || ':00'
 WHERE "hourFrom" IS NOT NULL AND "hourTo" IS NOT NULL;

-- 4) Channel × active index — list page filters by channel.
CREATE INDEX "Discount_outletId_channel_active_idx" ON "Discount"("outletId", "channel", "active");

-- 5) DiscountBogo — sparse 1:1 with Discount when type = BOGO.
CREATE TABLE "DiscountBogo" (
    "discountId" TEXT NOT NULL,
    "itemAmountMin" DOUBLE PRECISION,
    "buyScope" TEXT NOT NULL DEFAULT 'ALL',
    "buyScopeIds" TEXT,
    "getScope" TEXT NOT NULL DEFAULT 'ALL',
    "getScopeIds" TEXT,
    "buyQty" INTEGER NOT NULL DEFAULT 1,
    "getQty" INTEGER NOT NULL DEFAULT 1,
    "bogoValueType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "bogoValue" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "getItemPricing" TEXT NOT NULL DEFAULT 'LOWER',
    "buyItemPricing" TEXT NOT NULL DEFAULT 'LOWER',
    "showFreeQtyOnPos" BOOLEAN NOT NULL DEFAULT true,
    "buyAmountCap" DOUBLE PRECISION,

    CONSTRAINT "DiscountBogo_pkey" PRIMARY KEY ("discountId"),
    CONSTRAINT "DiscountBogo_discountId_fkey"
        FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 6) Coupon master — only used when Discount.validationMode = COUPON_VALIDATED.
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "maxRedemptions" INTEGER,
    "perUserLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Coupon_discountId_fkey"
        FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Coupon_outletId_fkey"
        FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Coupon_outletId_code_key" ON "Coupon"("outletId", "code");
CREATE INDEX "Coupon_code_idx" ON "Coupon"("code");

CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CouponRedemption_couponId_fkey"
        FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CouponRedemption_couponId_redeemedAt_idx" ON "CouponRedemption"("couponId", "redeemedAt");
CREATE INDEX "CouponRedemption_orderId_idx" ON "CouponRedemption"("orderId");

-- 7) DiscountUsage audit — per-bill snapshot of every fired discount.
CREATE TABLE "DiscountUsage" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT,
    "appliedAmount" DOUBLE PRECISION NOT NULL,
    "channel" TEXT,
    "outletId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountUsage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DiscountUsage_discountId_fkey"
        FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DiscountUsage_outletId_fkey"
        FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "DiscountUsage_discountId_createdAt_idx" ON "DiscountUsage"("discountId", "createdAt");
CREATE INDEX "DiscountUsage_outletId_createdAt_idx" ON "DiscountUsage"("outletId", "createdAt");
CREATE INDEX "DiscountUsage_orderId_idx" ON "DiscountUsage"("orderId");
