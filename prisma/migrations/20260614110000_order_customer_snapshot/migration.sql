-- Receipt-facing name + phone snapshot on Order. Powers the POS
-- "Change Customer Name" access-matrix action without retroactively
-- renaming a saved Customer across every historical bill.

ALTER TABLE "Order" ADD COLUMN "customerName" TEXT;
ALTER TABLE "Order" ADD COLUMN "customerPhone" TEXT;

-- Backfill from the linked Customer so existing bills keep their displayed
-- name. Phone may be null on legacy customers; that's fine.
UPDATE "Order" o
   SET "customerName" = c."name",
       "customerPhone" = c."phone"
  FROM "Customer" c
 WHERE o."customerId" = c."id"
   AND o."customerName" IS NULL;
