-- Supplier rate cards: tag each supplier with the credit days they extend +
-- per-line tracking on PurchaseOrderLine for when the SM goes off-card or
-- overrides the rate at PO time (with the dialog reason and the original
-- rate-card price both captured so we can audit later).
ALTER TABLE "Supplier" ADD COLUMN "creditDays" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "PurchaseOrderLine"
  ADD COLUMN "offCard"          BOOLEAN          NOT NULL DEFAULT false,
  ADD COLUMN "rateChangedFrom"  DOUBLE PRECISION,
  ADD COLUMN "rateChangeReason" TEXT;
