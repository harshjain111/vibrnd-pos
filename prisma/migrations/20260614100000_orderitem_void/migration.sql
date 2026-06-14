-- Soft-void columns on OrderItem (POS access-matrix: "Void items" action).
-- When voidedAt is set, the line is preserved for audit but excluded from
-- order totals by the recompute helper. voidReason is captured at the
-- action layer; nullable here only so the column add is non-destructive.

ALTER TABLE "OrderItem" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "OrderItem" ADD COLUMN "voidReason" TEXT;

CREATE INDEX "OrderItem_orderId_voidedAt_idx" ON "OrderItem"("orderId", "voidedAt");
