-- KDS v2 — K1 schema per KDS_Specification_v2 §21.
--
-- Adds Kitchen + KdsDevice + KotItemEvent tables, extends Item /
-- KitchenTicket / KitchenTicketLine with the v2 fields (routing,
-- comments jsonb, per-item statuses, event log, hold/fire, cancellation,
-- allergy, version). Additive-only migration: every new column is
-- nullable or defaulted, and legacy v1 code paths continue to work.

BEGIN;

-- ─── 1. Kitchen — routing target ─────────────────────────────────────
CREATE TABLE "Kitchen" (
  "id"        TEXT NOT NULL,
  "outletId"  TEXT NOT NULL,
  "code"      TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Kitchen_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Kitchen_outletId_code_key" ON "Kitchen" ("outletId", "code");
CREATE INDEX "Kitchen_outletId_isActive_sortOrder_idx"
  ON "Kitchen" ("outletId", "isActive", "sortOrder");

ALTER TABLE "Kitchen"
  ADD CONSTRAINT "Kitchen_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 2. KdsDevice — Display or Control screen ────────────────────────
CREATE TABLE "KdsDevice" (
  "id"         TEXT NOT NULL,
  "outletId"   TEXT NOT NULL,
  "kitchenId"  TEXT NOT NULL,
  "deviceCode" TEXT NOT NULL,
  "mode"       TEXT NOT NULL,
  "settings"   TEXT NOT NULL DEFAULT '{}',
  "lastSeenAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KdsDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KdsDevice_deviceCode_key" ON "KdsDevice" ("deviceCode");
CREATE INDEX "KdsDevice_outletId_kitchenId_idx"
  ON "KdsDevice" ("outletId", "kitchenId");

ALTER TABLE "KdsDevice"
  ADD CONSTRAINT "KdsDevice_kitchenId_fkey"
  FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 3. Item — routing + prep time ───────────────────────────────────
ALTER TABLE "Item"
  ADD COLUMN "kitchenId"   TEXT,
  ADD COLUMN "prepMinutes" INTEGER NOT NULL DEFAULT 10;

CREATE INDEX "Item_kitchenId_idx" ON "Item" ("kitchenId");

ALTER TABLE "Item"
  ADD CONSTRAINT "Item_kitchenId_fkey"
  FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 4. KitchenTicket — v2 KOT fields ────────────────────────────────
ALTER TABLE "KitchenTicket"
  ADD COLUMN "businessDate"  TIMESTAMP(3),
  ADD COLUMN "serviceMode"   TEXT,
  ADD COLUMN "tableLabel"    TEXT,
  ADD COLUMN "tokenNo"       TEXT,
  ADD COLUMN "guestCount"    INTEGER,
  ADD COLUMN "captainId"     TEXT,
  ADD COLUMN "isRush"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "kotNote"       TEXT,
  ADD COLUMN "allergyNote"   TEXT,
  ADD COLUMN "punchedAt"     TIMESTAMP(3),
  ADD COLUMN "clearedAt"     TIMESTAMP(3),
  ADD COLUMN "clearedReason" TEXT;

-- Timer origin backfill — legacy rows use createdAt as punched_at.
UPDATE "KitchenTicket" SET "punchedAt" = "createdAt" WHERE "punchedAt" IS NULL;

CREATE INDEX "KitchenTicket_outletId_businessDate_kotNo_idx"
  ON "KitchenTicket" ("outletId", "businessDate", "kotNo");
CREATE INDEX "KitchenTicket_outletId_clearedAt_idx"
  ON "KitchenTicket" ("outletId", "clearedAt");

-- ─── 5. KitchenTicketLine — v2 KotItem fields ────────────────────────
ALTER TABLE "KitchenTicketLine"
  ADD COLUMN "qtyReady"           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "portion"            TEXT,
  ADD COLUMN "isVeg"              BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "comments"           TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "commentKey"         TEXT NOT NULL DEFAULT '',
  ADD COLUMN "kitchenId"          TEXT,
  ADD COLUMN "movedFromKitchenId" TEXT,
  ADD COLUMN "prepMinutes"        INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "holdUntil"          TIMESTAMP(3),
  ADD COLUMN "heldMs"             BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "startedAt"          TIMESTAMP(3),
  ADD COLUMN "readyAt"            TIMESTAMP(3),
  ADD COLUMN "servedAt"           TIMESTAMP(3),
  ADD COLUMN "cancelledAt"        TIMESTAMP(3),
  ADD COLUMN "cancelReason"       TEXT,
  ADD COLUMN "cancelledBy"        TEXT,
  ADD COLUMN "cancelAckAt"        TIMESTAMP(3),
  ADD COLUMN "cancelAckBy"        TEXT,
  ADD COLUMN "wasWasted"          BOOLEAN,
  ADD COLUMN "isRecalled"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recallCount"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "allergyAckAt"       TIMESTAMP(3),
  ADD COLUMN "version"            INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "KitchenTicketLine_kitchenId_status_idx"
  ON "KitchenTicketLine" ("kitchenId", "status");
CREATE INDEX "KitchenTicketLine_kitchenId_status_updatedAt_idx"
  ON "KitchenTicketLine" ("kitchenId", "status", "updatedAt");
CREATE INDEX "KitchenTicketLine_status_cancelledAt_idx"
  ON "KitchenTicketLine" ("status", "cancelledAt");
CREATE INDEX "KitchenTicketLine_holdUntil_idx"
  ON "KitchenTicketLine" ("holdUntil");

ALTER TABLE "KitchenTicketLine"
  ADD CONSTRAINT "KitchenTicketLine_kitchenId_fkey"
  FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 6. KotItemEvent — append-only ───────────────────────────────────
CREATE TABLE "KotItemEvent" (
  "id"         BIGSERIAL PRIMARY KEY,
  "kotItemId"  TEXT NOT NULL,
  "kotId"      TEXT NOT NULL,
  "outletId"   TEXT NOT NULL,
  "kitchenId"  TEXT,
  "fromStatus" TEXT,
  "toStatus"   TEXT NOT NULL,
  "actorId"    TEXT,
  "actorRole"  TEXT NOT NULL,
  "deviceId"   TEXT,
  "reason"     TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "KotItemEvent_outletId_occurredAt_toStatus_idx"
  ON "KotItemEvent" ("outletId", "occurredAt", "toStatus");
CREATE INDEX "KotItemEvent_kotItemId_occurredAt_idx"
  ON "KotItemEvent" ("kotItemId", "occurredAt");
CREATE INDEX "KotItemEvent_kotId_occurredAt_idx"
  ON "KotItemEvent" ("kotId", "occurredAt");

ALTER TABLE "KotItemEvent"
  ADD CONSTRAINT "KotItemEvent_kotItemId_fkey"
  FOREIGN KEY ("kotItemId") REFERENCES "KitchenTicketLine"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KotItemEvent"
  ADD CONSTRAINT "KotItemEvent_kitchenId_fkey"
  FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
