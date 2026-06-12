-- Link Purchase Orders back to the Requisition that triggered them so
-- the SM can raise a PO directly from an approved req with insufficient
-- store stock — items prefill, parent req is recorded.
ALTER TABLE "PurchaseOrder" ADD COLUMN "requisitionId" TEXT;

CREATE INDEX "PurchaseOrder_requisitionId_idx" ON "PurchaseOrder"("requisitionId");

ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_requisitionId_fkey"
  FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
