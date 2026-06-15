-- Per-line complimentary (Box 2 of the POS Advanced Billing Operations
-- spec) + the mandatory reason field for manager-applied discounts.

ALTER TABLE "OrderItem" ADD COLUMN "complimentary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrderItem" ADD COLUMN "compReason" TEXT;

ALTER TABLE "Order" ADD COLUMN "discountReason" TEXT;
