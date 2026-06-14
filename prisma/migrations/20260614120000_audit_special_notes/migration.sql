-- Box 1 + Box 8 of the POS spec: Customer.specialNotes for receptionist
-- intake, and the four audit-trail columns (role / reason / oldValue /
-- newValue) so void / discount / comp / move actions can capture the
-- before-after snapshot the spec requires.

ALTER TABLE "Customer" ADD COLUMN "specialNotes" TEXT;

ALTER TABLE "ActivityLog" ADD COLUMN "role" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "reason" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "oldValue" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "newValue" TEXT;

-- Best-effort backfill: copy the role from the User row whose email
-- matches the actor. Legacy rows where actor is "system" or where the
-- email no longer resolves stay null.
UPDATE "ActivityLog" al
   SET "role" = u."role"
  FROM "User" u
 WHERE u."email" = al."actor"
   AND al."role" IS NULL;
