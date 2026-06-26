-- KOT printers mapped to kitchen stations (departments).
CREATE TABLE "Printer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "station" TEXT NOT NULL DEFAULT 'MAIN',
    "target" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "outletId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Printer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Printer_outletId_station_active_idx" ON "Printer"("outletId", "station", "active");

ALTER TABLE "Printer"
  ADD CONSTRAINT "Printer_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
