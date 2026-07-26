-- CVE v2 — R2: backfill legacy 8-bucket data into the 2-bucket + sourceKind model.
--
-- Mapping (per PRD §12):
--
--   V1 bucket    →  V2 bucket   sourceKind
--   ─────────────────────────────────────────
--   CAMPAIGN     →  PROMO       CAMPAIGN
--   CASHBACK     →  CASH        CASHBACK
--   MEMBERSHIP   →  CASH        MEMBERSHIP
--   REFERRAL     →  CASH        REFERRAL
--   REFUND       →  CASH        REFUND
--   LOYALTY      →  CASH        LOYALTY_CONVERT
--   MANUAL       →  CASH        MANUAL
--   PREPAID      →  CASH        RECHARGE
--
-- Idempotent — safe to re-run. Only touches rows whose sourceKind is still
-- NULL (i.e. haven't been backfilled yet). Existing values are respected.

BEGIN;

-- 1. sourceKind — set from the old bucket value (before we rewrite bucket).
UPDATE "WalletTransaction"
SET "sourceKind" = CASE "bucket"
    WHEN 'CAMPAIGN'   THEN 'CAMPAIGN'
    WHEN 'CASHBACK'   THEN 'CASHBACK'
    WHEN 'MEMBERSHIP' THEN 'MEMBERSHIP'
    WHEN 'REFERRAL'   THEN 'REFERRAL'
    WHEN 'REFUND'     THEN 'REFUND'
    WHEN 'LOYALTY'    THEN 'LOYALTY_CONVERT'
    WHEN 'MANUAL'     THEN 'MANUAL'
    WHEN 'PREPAID'    THEN 'RECHARGE'
    WHEN 'CASH'       THEN COALESCE("sourceKind", 'MANUAL')
    WHEN 'PROMO'      THEN COALESCE("sourceKind", 'CAMPAIGN')
    ELSE 'MANUAL'
END
WHERE "sourceKind" IS NULL;

-- 2. restrictionsJson — copy restrictions from the parent campaign for
--    v1 CAMPAIGN-bucket credits so PROMO wallet still honours caps.
--    v1 didn't carry per-credit restrictions in a structured field, so we
--    seed with an empty object and let the admin fill max-percent / min-bill
--    from the campaign in the v2 promotion builder.
UPDATE "WalletTransaction"
SET "restrictionsJson" = '{}'
WHERE "bucket" = 'CAMPAIGN' AND "restrictionsJson" IS NULL;

-- 3. bucket — collapse to CASH / PROMO.
UPDATE "WalletTransaction"
SET "bucket" = CASE "bucket"
    WHEN 'CAMPAIGN' THEN 'PROMO'
    -- Everything else (including special-case buckets) becomes CASH.
    WHEN 'CASHBACK'   THEN 'CASH'
    WHEN 'MEMBERSHIP' THEN 'CASH'
    WHEN 'REFERRAL'   THEN 'CASH'
    WHEN 'REFUND'     THEN 'CASH'
    WHEN 'LOYALTY'    THEN 'CASH'
    WHEN 'MANUAL'     THEN 'CASH'
    WHEN 'PREPAID'    THEN 'CASH'
    ELSE "bucket"  -- already CASH / PROMO — leave alone
END;

-- 4. Campaign — seed trigger + destinationKind for legacy campaigns so the
--    v2 evaluator has something to route on. Default to the most common
--    combo: BILL_PAID trigger, CASH_WALLET destination. Admins can adjust
--    per campaign in the updated builder.
UPDATE "Campaign"
SET "trigger" = 'BILL_PAID'
WHERE "trigger" IS NULL;

UPDATE "Campaign"
SET "destinationKind" = 'CASH_WALLET'
WHERE "destinationKind" IS NULL;

COMMIT;
