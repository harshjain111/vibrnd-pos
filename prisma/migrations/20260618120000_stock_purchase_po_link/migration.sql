-- Stock Purchase (VendorInvoice) can be raised directly against a Purchase Order.
ALTER TABLE "VendorInvoice" ADD COLUMN "poId" TEXT;

ALTER TABLE "VendorInvoice"
  ADD CONSTRAINT "VendorInvoice_poId_fkey"
  FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "VendorInvoice_poId_idx" ON "VendorInvoice"("poId");
