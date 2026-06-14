-- Table groups (sections of the floor plan owned by a default Captain)
-- + Reservations (future-time bookings) per the receptionist flow spec.

CREATE TABLE "TableGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "captainId" TEXT,
    "outletId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableGroup_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TableGroup_captainId_fkey"
        FOREIGN KEY ("captainId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TableGroup_outletId_fkey"
        FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "TableGroup_outletId_idx" ON "TableGroup"("outletId");

-- Link DiningTable -> TableGroup (nullable; ungrouped tables keep working).
ALTER TABLE "DiningTable" ADD COLUMN "tableGroupId" TEXT;
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_tableGroupId_fkey"
    FOREIGN KEY ("tableGroupId") REFERENCES "TableGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "DiningTable_tableGroupId_idx" ON "DiningTable"("tableGroupId");

-- Reservations — future-time bookings the receptionist makes when a guest
-- phones ahead. Floor plan colours the table Reserved until status flips.
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "reservedFor" TIMESTAMP(3) NOT NULL,
    "partySize" INTEGER NOT NULL DEFAULT 2,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "orderId" TEXT,
    "outletId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Reservation_tableId_fkey"
        FOREIGN KEY ("tableId") REFERENCES "DiningTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reservation_customerId_fkey"
        FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reservation_outletId_fkey"
        FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Reservation_outletId_reservedFor_idx" ON "Reservation"("outletId", "reservedFor");
CREATE INDEX "Reservation_tableId_status_idx" ON "Reservation"("tableId", "status");
