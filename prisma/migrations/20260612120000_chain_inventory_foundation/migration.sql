-- AlterTable
ALTER TABLE "Outlet" ADD COLUMN     "applyBKMarkupOnTransfer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "baseKitchenOutletId" TEXT,
ADD COLUMN     "baseStoreOutletId" TEXT,
ADD COLUMN     "bkMarkupPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'OUTLET',
ADD COLUMN     "multiDeptInventoryEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requireCostControlApproval" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "ccApprovedAt" TIMESTAMP(3),
ADD COLUMN     "ccApprovedById" TEXT,
ADD COLUMN     "ccRejectionReason" TEXT,
ADD COLUMN     "departmentId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrderLine" ADD COLUMN     "qtyReceived" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RawMaterial" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'PURCHASED';

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "departmentId" TEXT;

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "fromDepartmentId" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'CHAIN',
ADD COLUMN     "requisitionId" TEXT,
ADD COLUMN     "toDepartmentId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "departmentId" TEXT;

-- AlterTable
ALTER TABLE "VendorPayment" ADD COLUMN     "vendorInvoiceId" TEXT;

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requisition" (
    "id" TEXT NOT NULL,
    "reqNo" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "fromDepartmentId" TEXT NOT NULL,
    "toDepartmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "requestedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisitionLine" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "qtyRequested" DOUBLE PRECISION NOT NULL,
    "qtyApproved" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "declineReason" TEXT,

    CONSTRAINT "RequisitionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grn" (
    "id" TEXT NOT NULL,
    "grnNo" TEXT NOT NULL,
    "poId" TEXT,
    "isAdHoc" BOOLEAN NOT NULL DEFAULT false,
    "outletId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "receivedById" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'CLOSED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrnLine" (
    "id" TEXT NOT NULL,
    "grnId" TEXT NOT NULL,
    "poLineId" TEXT,
    "rawMaterialId" TEXT NOT NULL,
    "qtyReceived" DOUBLE PRECISION NOT NULL,
    "qtyDamaged" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qtyShort" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "batchNo" TEXT,
    "expiryDate" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "GrnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "supplierId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "subTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grandTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fileUrl" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorInvoiceGrnLink" (
    "invoiceId" TEXT NOT NULL,
    "grnId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "VendorInvoiceGrnLink_pkey" PRIMARY KEY ("invoiceId","grnId")
);

-- CreateIndex
CREATE INDEX "Department_outletId_active_idx" ON "Department"("outletId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Department_outletId_kind_name_key" ON "Department"("outletId", "kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Requisition_reqNo_key" ON "Requisition"("reqNo");

-- CreateIndex
CREATE INDEX "Requisition_outletId_status_createdAt_idx" ON "Requisition"("outletId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Requisition_fromDepartmentId_status_idx" ON "Requisition"("fromDepartmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Grn_grnNo_key" ON "Grn"("grnNo");

-- CreateIndex
CREATE INDEX "Grn_outletId_status_createdAt_idx" ON "Grn"("outletId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "VendorInvoice_outletId_status_invoiceDate_idx" ON "VendorInvoice"("outletId", "status", "invoiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "VendorInvoice_supplierId_invoiceNo_key" ON "VendorInvoice"("supplierId", "invoiceNo");

-- CreateIndex
CREATE INDEX "StockMovement_departmentId_createdAt_idx" ON "StockMovement"("departmentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_requisitionId_key" ON "Transfer"("requisitionId");

-- CreateIndex
CREATE INDEX "Transfer_fromDepartmentId_status_idx" ON "Transfer"("fromDepartmentId", "status");

-- CreateIndex
CREATE INDEX "Transfer_toDepartmentId_status_idx" ON "Transfer"("toDepartmentId", "status");

-- CreateIndex
CREATE INDEX "VendorPayment_vendorInvoiceId_idx" ON "VendorPayment"("vendorInvoiceId");

-- AddForeignKey
ALTER TABLE "Outlet" ADD CONSTRAINT "Outlet_baseStoreOutletId_fkey" FOREIGN KEY ("baseStoreOutletId") REFERENCES "Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outlet" ADD CONSTRAINT "Outlet_baseKitchenOutletId_fkey" FOREIGN KEY ("baseKitchenOutletId") REFERENCES "Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromDepartmentId_fkey" FOREIGN KEY ("fromDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toDepartmentId_fkey" FOREIGN KEY ("toDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_vendorInvoiceId_fkey" FOREIGN KEY ("vendorInvoiceId") REFERENCES "VendorInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_fromDepartmentId_fkey" FOREIGN KEY ("fromDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_toDepartmentId_fkey" FOREIGN KEY ("toDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionLine" ADD CONSTRAINT "RequisitionLine_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grn" ADD CONSTRAINT "Grn_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grn" ADD CONSTRAINT "Grn_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grn" ADD CONSTRAINT "Grn_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrnLine" ADD CONSTRAINT "GrnLine_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "Grn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrnLine" ADD CONSTRAINT "GrnLine_poLineId_fkey" FOREIGN KEY ("poLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorInvoice" ADD CONSTRAINT "VendorInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorInvoice" ADD CONSTRAINT "VendorInvoice_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorInvoiceGrnLink" ADD CONSTRAINT "VendorInvoiceGrnLink_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "VendorInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorInvoiceGrnLink" ADD CONSTRAINT "VendorInvoiceGrnLink_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "Grn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

