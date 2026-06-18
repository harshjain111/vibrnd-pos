-- Vendor Invoicing flow (spec section 5). Adds the variance-review state
-- machine on top of the existing payment status:
--
--   PENDING (just created)
--     ├── auto-route on amount comparison ──────────────────────┐
--     ▼                                                          ▼
--   MATCHED (amount == expected, accountant clicks Verify)    DISPUTED (amount > expected, CC reviews)
--     │                                                          │
--     │                          ┌──── CC: VENDOR_MISTAKE ──── REJECTED (vendor re-invoices)
--     │                          │
--     ▼                          ▼
--   CLEARED ◄─────────── CC: PRICE_INCREASE_VALID
--     │
--     ▼
--   accounts pay → VendorInvoice.status rolls UNPAID → PARTIAL → PAID (unchanged)

ALTER TABLE "VendorInvoice"
  ADD COLUMN "invoiceAmount"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "expectedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "variance"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "reviewStatus"   TEXT             NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "varianceReason" TEXT,
  ADD COLUMN "varianceNotes"  TEXT,
  ADD COLUMN "ccReviewedById" TEXT,
  ADD COLUMN "ccReviewedAt"   TIMESTAMP(3),
  ADD COLUMN "verifiedById"   TEXT,
  ADD COLUMN "verifiedAt"     TIMESTAMP(3);

CREATE INDEX "VendorInvoice_outletId_reviewStatus_idx"
  ON "VendorInvoice"("outletId", "reviewStatus");

-- Backfill historic invoices: treat them as already CLEARED (they were
-- accepted before the variance flow existed) and set invoiceAmount =
-- their existing grandTotal so reports keep working.
UPDATE "VendorInvoice"
   SET "invoiceAmount"  = "grandTotal",
       "expectedAmount" = "grandTotal",
       "variance"       = 0,
       "reviewStatus"   = 'CLEARED'
 WHERE "createdAt" < NOW();
