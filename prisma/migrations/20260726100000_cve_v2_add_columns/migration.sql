-- CVE v2 — R1: additive columns.
-- Ships in one deploy with R2 (the backfill + code collapse). All columns
-- nullable so the schema is compatible with v1 code that briefly reads
-- from the DB between migrate-deploy and next-build during rollout.

-- ─── WalletTransaction — reporting label + promo restrictions ───────────
ALTER TABLE "WalletTransaction"
  ADD COLUMN "sourceKind"       TEXT,
  ADD COLUMN "restrictionsJson" TEXT;

CREATE INDEX "WalletTransaction_walletAccountId_sourceKind_idx"
  ON "WalletTransaction" ("walletAccountId", "sourceKind");

-- ─── Campaign — trigger event + benefit destination ────────────────────
ALTER TABLE "Campaign"
  ADD COLUMN "trigger"         TEXT,
  ADD COLUMN "destinationKind" TEXT;

CREATE INDEX "Campaign_outletId_trigger_active_idx"
  ON "Campaign" ("outletId", "trigger", "active");

-- ─── CampaignBenefit — per-benefit destination override ────────────────
ALTER TABLE "CampaignBenefit"
  ADD COLUMN "destinationOverride" TEXT;
