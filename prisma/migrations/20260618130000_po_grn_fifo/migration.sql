-- PO/GRN/FIFO Phase 1
-- 1. OrderItem gains a `cogs` snapshot column.
-- 2. PurchaseOrder gains a `batchKey` (groups N POs from one auto-PO submit).
-- 3. Grn header gets the spec's challan/invoice charge fields.
-- 4. New StockBatch model — the FIFO ledger.
-- 5. One OPENING StockBatch backfilled per RawMaterial × STORE dept where currentQty > 0
--    so the existing balance is queryable through the same path as future receipts.

-- ─── 1. OrderItem.cogs ───────────────────────────────────────────────────
ALTER TABLE "OrderItem" ADD COLUMN "cogs" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- ─── 2. PurchaseOrder.batchKey ───────────────────────────────────────────
ALTER TABLE "PurchaseOrder" ADD COLUMN "batchKey" TEXT;
CREATE INDEX "PurchaseOrder_batchKey_idx" ON "PurchaseOrder"("batchKey");

-- ─── 3. Grn header charges ──────────────────────────────────────────────
ALTER TABLE "Grn"
  ADD COLUMN "vendorInvoiceNo"   TEXT,
  ADD COLUMN "vendorInvoiceDate" TIMESTAMP(3),
  ADD COLUMN "freightCharges"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryCharges"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "discountAmount"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "otherCharges"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "taxAmount"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "landedSubTotal"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "landedTotal"       DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill landedSubTotal + landedTotal for existing GRNs so historic
-- rows aren't broken — both default to the line-item subtotal (no charges
-- captured for the legacy ones).
UPDATE "Grn" SET
  "landedSubTotal" = COALESCE((
    SELECT SUM("qtyReceived" * "unitCost") FROM "GrnLine" WHERE "GrnLine"."grnId" = "Grn"."id"
  ), 0),
  "landedTotal" = COALESCE((
    SELECT SUM("qtyReceived" * "unitCost") FROM "GrnLine" WHERE "GrnLine"."grnId" = "Grn"."id"
  ), 0);

-- ─── 4. StockBatch model ────────────────────────────────────────────────
CREATE TABLE "StockBatch" (
  "id"            TEXT NOT NULL,
  "rawMaterialId" TEXT NOT NULL,
  "outletId"      TEXT NOT NULL,
  "departmentId"  TEXT NOT NULL,
  "qtyReceived"   DOUBLE PRECISION NOT NULL,
  "qtyRemaining"  DOUBLE PRECISION NOT NULL,
  "ratePerUnit"   DOUBLE PRECISION NOT NULL,
  "source"        TEXT NOT NULL DEFAULT 'GRN_RECEIPT',
  "grnLineId"     TEXT,
  "grnId"         TEXT,
  "batchNo"       TEXT,
  "expiryDate"    TIMESTAMP(3),
  "receivedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt"      TIMESTAMP(3),
  CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockBatch_grnLineId_key" ON "StockBatch"("grnLineId");
CREATE INDEX "StockBatch_rawMaterialId_departmentId_qtyRemaining_idx" ON "StockBatch"("rawMaterialId", "departmentId", "qtyRemaining");
CREATE INDEX "StockBatch_outletId_receivedAt_idx" ON "StockBatch"("outletId", "receivedAt");
CREATE INDEX "StockBatch_grnId_idx" ON "StockBatch"("grnId");

ALTER TABLE "StockBatch"
  ADD CONSTRAINT "StockBatch_rawMaterialId_fkey"
    FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockBatch_outletId_fkey"
    FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockBatch_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockBatch_grnLineId_fkey"
    FOREIGN KEY ("grnLineId") REFERENCES "GrnLine"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "StockBatch_grnId_fkey"
    FOREIGN KEY ("grnId") REFERENCES "Grn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 5. Backfill OPENING batches ─────────────────────────────────────────
-- For every RawMaterial with currentQty > 0, write one OPENING batch
-- against the outlet's STORE dept at the current avgCost. This is what
-- FIFO consumption draws down before any new GRN_RECEIPT batches.
-- Uses concat('open-', rm.id) as the deterministic id so re-running the
-- backfill on a fresh DB doesn't double-create.
INSERT INTO "StockBatch" (
  "id", "rawMaterialId", "outletId", "departmentId",
  "qtyReceived", "qtyRemaining", "ratePerUnit", "source",
  "receivedAt"
)
SELECT
  'open-' || rm."id"                       AS "id",
  rm."id"                                  AS "rawMaterialId",
  rm."outletId"                            AS "outletId",
  d."id"                                   AS "departmentId",
  rm."currentQty"                          AS "qtyReceived",
  rm."currentQty"                          AS "qtyRemaining",
  CASE WHEN rm."avgCost" > 0 THEN rm."avgCost" ELSE rm."purchasePrice" END AS "ratePerUnit",
  'OPENING'                                AS "source",
  CURRENT_TIMESTAMP                        AS "receivedAt"
FROM "RawMaterial" rm
JOIN "Department" d ON d."outletId" = rm."outletId" AND d."kind" = 'STORE' AND d."active" = true
WHERE rm."currentQty" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "StockBatch" b WHERE b."id" = 'open-' || rm."id"
  );
