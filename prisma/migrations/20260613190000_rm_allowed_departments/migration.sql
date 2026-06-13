-- Per-RM department gate: which HODs are allowed to see and request this
-- raw material. NULL = no restriction (visible to every dept). Otherwise
-- comma-separated list of department kinds (KITCHEN, BAR, HOUSEKEEPING,
-- STORE). Filtered into HOD requisition forms + department catalog views.
ALTER TABLE "RawMaterial" ADD COLUMN "allowedDepartments" TEXT;
