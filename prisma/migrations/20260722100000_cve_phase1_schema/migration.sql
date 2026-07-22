-- Customer Value Engine — Phase 1
-- Wallet ledger (bucketed FIFO) + generic Campaign / Rule / Benefit registry
-- + OTP challenges. Zero data-loss migration: all new columns are nullable
-- or defaulted; MembershipBenefit is extended, not replaced.

-- ─── 1. MembershipBenefit gets an optional CVE registry link ─────────────
ALTER TABLE "MembershipBenefit" ADD COLUMN "benefitDefId" TEXT;
CREATE INDEX "MembershipBenefit_benefitDefId_idx" ON "MembershipBenefit"("benefitDefId");

-- ─── 2. WalletAccount ───────────────────────────────────────────────────
CREATE TABLE "WalletAccount" (
  "id"            TEXT NOT NULL,
  "customerId"    TEXT NOT NULL,
  "outletId"      TEXT NOT NULL,
  "cachedBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WalletAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WalletAccount_customerId_key" ON "WalletAccount"("customerId");
CREATE INDEX "WalletAccount_outletId_idx" ON "WalletAccount"("outletId");

-- ─── 3. WalletTransaction — immutable append-only ledger ─────────────────
CREATE TABLE "WalletTransaction" (
  "id"               TEXT NOT NULL,
  "walletAccountId"  TEXT NOT NULL,
  "type"             TEXT NOT NULL,
  "bucket"           TEXT NOT NULL,
  "amount"           DOUBLE PRECISION NOT NULL,
  "remaining"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "expiresAt"        TIMESTAMP(3),
  "source"           TEXT NOT NULL,
  "campaignId"       TEXT,
  "membershipId"     TEXT,
  "orderId"          TEXT,
  "drawsFromJson"    TEXT,
  "actor"            TEXT NOT NULL DEFAULT 'system',
  "outletId"         TEXT NOT NULL,
  "remarks"          TEXT,
  "txIdempotencyKey" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WalletTransaction_walletAccountId_txIdempotencyKey_key"
  ON "WalletTransaction"("walletAccountId", "txIdempotencyKey");
CREATE INDEX "WalletTransaction_walletAccountId_createdAt_idx"
  ON "WalletTransaction"("walletAccountId", "createdAt");
CREATE INDEX "WalletTransaction_walletAccountId_bucket_remaining_expiresAt_idx"
  ON "WalletTransaction"("walletAccountId", "bucket", "remaining", "expiresAt");
CREATE INDEX "WalletTransaction_outletId_createdAt_idx"
  ON "WalletTransaction"("outletId", "createdAt");

-- ─── 4. Campaign ─────────────────────────────────────────────────────────
CREATE TABLE "Campaign" (
  "id"             TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "description"    TEXT,
  "outletId"       TEXT NOT NULL,
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "startsAt"       TIMESTAMP(3) NOT NULL,
  "endsAt"         TIMESTAMP(3) NOT NULL,
  "maxRedemptions" INTEGER,
  "maxPerCustomer" INTEGER,
  "priority"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Campaign_outletId_active_startsAt_endsAt_idx"
  ON "Campaign"("outletId", "active", "startsAt", "endsAt");

-- ─── 5. CampaignRule (IF vocabulary) ─────────────────────────────────────
CREATE TABLE "CampaignRule" (
  "id"            TEXT NOT NULL,
  "campaignId"    TEXT NOT NULL,
  "conditionType" TEXT NOT NULL,
  "configJson"    TEXT NOT NULL,
  "groupOp"       TEXT NOT NULL DEFAULT 'AND',
  "order"         INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "CampaignRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CampaignRule_campaignId_order_idx" ON "CampaignRule"("campaignId", "order");

-- ─── 6. BenefitDef (THEN vocabulary — reused across Campaign + Membership) ─
CREATE TABLE "BenefitDef" (
  "id"         TEXT NOT NULL,
  "outletId"   TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "type"       TEXT NOT NULL,
  "configJson" TEXT NOT NULL,
  "active"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BenefitDef_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BenefitDef_outletId_active_type_idx"
  ON "BenefitDef"("outletId", "active", "type");

-- ─── 7. CampaignBenefit — Campaign ⇄ BenefitDef bridge ───────────────────
CREATE TABLE "CampaignBenefit" (
  "id"           TEXT NOT NULL,
  "campaignId"   TEXT NOT NULL,
  "benefitDefId" TEXT NOT NULL,
  "overrideJson" TEXT,
  "order"        INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "CampaignBenefit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CampaignBenefit_campaignId_benefitDefId_key"
  ON "CampaignBenefit"("campaignId", "benefitDefId");
CREATE INDEX "CampaignBenefit_campaignId_order_idx"
  ON "CampaignBenefit"("campaignId", "order");

-- ─── 8. RedemptionHistory (offer-level ledger) ───────────────────────────
CREATE TABLE "RedemptionHistory" (
  "id"             TEXT NOT NULL,
  "customerId"     TEXT NOT NULL,
  "campaignId"     TEXT,
  "benefitLabel"   TEXT NOT NULL,
  "orderId"        TEXT,
  "outletId"       TEXT NOT NULL,
  "amount"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "metaJson"       TEXT,
  "idempotencyKey" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RedemptionHistory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RedemptionHistory_idempotencyKey_key"
  ON "RedemptionHistory"("idempotencyKey");
CREATE INDEX "RedemptionHistory_customerId_createdAt_idx"
  ON "RedemptionHistory"("customerId", "createdAt");
CREATE INDEX "RedemptionHistory_campaignId_createdAt_idx"
  ON "RedemptionHistory"("campaignId", "createdAt");
CREATE INDEX "RedemptionHistory_outletId_createdAt_idx"
  ON "RedemptionHistory"("outletId", "createdAt");

-- ─── 9. OtpChallenge (wallet redeem + Aadhaar verify) ────────────────────
CREATE TABLE "OtpChallenge" (
  "id"          TEXT NOT NULL,
  "purpose"     TEXT NOT NULL,
  "subjectId"   TEXT NOT NULL,
  "outletId"    TEXT NOT NULL,
  "codeHash"    TEXT NOT NULL,
  "channel"     TEXT,
  "channelHint" TEXT,
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "usedAt"      TIMESTAMP(3),
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "metaJson"    TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OtpChallenge_subjectId_purpose_createdAt_idx"
  ON "OtpChallenge"("subjectId", "purpose", "createdAt");
CREATE INDEX "OtpChallenge_outletId_createdAt_idx"
  ON "OtpChallenge"("outletId", "createdAt");
CREATE INDEX "OtpChallenge_expiresAt_idx" ON "OtpChallenge"("expiresAt");

-- ─── 10. Foreign keys ────────────────────────────────────────────────────
ALTER TABLE "MembershipBenefit"
  ADD CONSTRAINT "MembershipBenefit_benefitDefId_fkey"
  FOREIGN KEY ("benefitDefId") REFERENCES "BenefitDef"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WalletAccount"
  ADD CONSTRAINT "WalletAccount_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletAccount"
  ADD CONSTRAINT "WalletAccount_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WalletTransaction"
  ADD CONSTRAINT "WalletTransaction_walletAccountId_fkey"
  FOREIGN KEY ("walletAccountId") REFERENCES "WalletAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction"
  ADD CONSTRAINT "WalletTransaction_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction"
  ADD CONSTRAINT "WalletTransaction_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "MembershipPlan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction"
  ADD CONSTRAINT "WalletTransaction_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction"
  ADD CONSTRAINT "WalletTransaction_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Campaign"
  ADD CONSTRAINT "Campaign_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CampaignRule"
  ADD CONSTRAINT "CampaignRule_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BenefitDef"
  ADD CONSTRAINT "BenefitDef_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CampaignBenefit"
  ADD CONSTRAINT "CampaignBenefit_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignBenefit"
  ADD CONSTRAINT "CampaignBenefit_benefitDefId_fkey"
  FOREIGN KEY ("benefitDefId") REFERENCES "BenefitDef"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RedemptionHistory"
  ADD CONSTRAINT "RedemptionHistory_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RedemptionHistory"
  ADD CONSTRAINT "RedemptionHistory_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RedemptionHistory"
  ADD CONSTRAINT "RedemptionHistory_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RedemptionHistory"
  ADD CONSTRAINT "RedemptionHistory_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OtpChallenge"
  ADD CONSTRAINT "OtpChallenge_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
