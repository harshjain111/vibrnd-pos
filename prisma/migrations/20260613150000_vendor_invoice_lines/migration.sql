-- Per-item lines on a VendorInvoice so the accountant can capture what
-- the vendor actually billed (qty + unit price + tax). Server caps qty
-- at the cumulative PO line qty across the invoice's linked GRNs minus
-- what was already invoiced elsewhere, so the vendor billing the full
-- PO ahead of all GRNs being punched still works without double-counting.
CREATE TABLE "VendorInvoiceLine" (
  "id"            TEXT NOT NULL,
  "invoiceId"     TEXT NOT NULL,
  "rawMaterialId" TEXT NOT NULL,
  "description"   TEXT,
  "qty"           DOUBLE PRECISION NOT NULL,
  "unit"          TEXT NOT NULL,
  "unitPrice"     DOUBLE PRECISION NOT NULL,
  "taxRate"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lineSubTotal"  DOUBLE PRECISION NOT NULL,
  "lineTax"       DOUBLE PRECISION NOT NULL,
  "lineTotal"     DOUBLE PRECISION NOT NULL,

  CONSTRAINT "VendorInvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VendorInvoiceLine_invoiceId_idx" ON "VendorInvoiceLine"("invoiceId");
CREATE INDEX "VendorInvoiceLine_rawMaterialId_idx" ON "VendorInvoiceLine"("rawMaterialId");

ALTER TABLE "VendorInvoiceLine" ADD CONSTRAINT "VendorInvoiceLine_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "VendorInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VendorInvoiceLine" ADD CONSTRAINT "VendorInvoiceLine_rawMaterialId_fkey"
  FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
