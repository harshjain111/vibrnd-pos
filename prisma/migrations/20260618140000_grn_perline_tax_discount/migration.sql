-- Per-line tax + discount on GRN lines (spec section 3 — vendor's challan
-- captures rate + tax + discount per item before the bill-level overheads
-- like freight/delivery/other are added on top).
ALTER TABLE "GrnLine"
  ADD COLUMN "taxRate"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "taxAmount"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "lineDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0;
