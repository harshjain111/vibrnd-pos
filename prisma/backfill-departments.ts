/**
 * Backfill script for the chain-inventory foundation migration.
 *
 * Idempotent. Safe to re-run any number of times.
 *
 * What it does:
 *   1. For every active outlet, ensure a STORE department exists. Existing
 *      stock — by definition — lived "at the outlet" with no sub-unit, so
 *      conceptually it all sat in the Store. We materialise that.
 *   2. Backfill StockMovement.departmentId → outlet's STORE dept.
 *   3. Backfill Transfer.fromDepartmentId / toDepartmentId → sender/receiver
 *      outlet's STORE dept respectively.
 *   4. Backfill PurchaseOrder.departmentId → outlet's STORE dept.
 *   5. Default extra departments for OUTLET-kind outlets that have
 *      multiDeptInventoryEnabled=true: KITCHEN, BAR, HOUSEKEEPING. The user
 *      can rename / delete from the UI later.
 *
 * Run:  npm run db:backfill:departments
 */
import { PrismaClient } from "@prisma/client";

const seedUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const db = new PrismaClient({ datasources: { db: { url: seedUrl } } });

async function ensureDepartment(outletId: string, kind: string, name: string) {
  const existing = await db.department.findUnique({
    where: { outletId_kind_name: { outletId, kind, name } },
  });
  if (existing) return existing;
  return db.department.create({
    data: { outletId, kind, name, active: true },
  });
}

async function main() {
  console.log("─── Department backfill starting ───");

  const outlets = await db.outlet.findMany({ orderBy: { createdAt: "asc" } });
  console.log(`Processing ${outlets.length} outlet(s)`);

  // 1 + 5. Create departments per outlet.
  const storeByOutlet = new Map<string, string>();
  for (const o of outlets) {
    const store = await ensureDepartment(o.id, "STORE", "Store");
    storeByOutlet.set(o.id, store.id);

    if (o.kind === "OUTLET" && o.multiDeptInventoryEnabled) {
      await ensureDepartment(o.id, "KITCHEN", "Kitchen");
      await ensureDepartment(o.id, "BAR", "Bar");
      await ensureDepartment(o.id, "HOUSEKEEPING", "Housekeeping");
    }
    console.log(`  ✓ ${o.code} (${o.kind}) — STORE dept ready`);
  }

  // 2. Backfill StockMovement.departmentId
  const smCount = await db.stockMovement.count({ where: { departmentId: null } });
  if (smCount > 0) {
    console.log(`  Backfilling ${smCount} StockMovement rows...`);
    for (const [outletId, storeId] of storeByOutlet) {
      const updated = await db.stockMovement.updateMany({
        where: { outletId, departmentId: null },
        data: { departmentId: storeId },
      });
      if (updated.count > 0) console.log(`    • ${updated.count} movements → STORE of ${outletId}`);
    }
  } else {
    console.log("  ⏭  StockMovement already backfilled");
  }

  // 3. Backfill Transfer dept FKs
  const tfCount = await db.transfer.count({
    where: { OR: [{ fromDepartmentId: null }, { toDepartmentId: null }] },
  });
  if (tfCount > 0) {
    console.log(`  Backfilling ${tfCount} Transfer rows...`);
    const transfers = await db.transfer.findMany({
      where: { OR: [{ fromDepartmentId: null }, { toDepartmentId: null }] },
      select: { id: true, senderOutletId: true, receiverOutletId: true },
    });
    for (const t of transfers) {
      await db.transfer.update({
        where: { id: t.id },
        data: {
          fromDepartmentId: storeByOutlet.get(t.senderOutletId) ?? null,
          toDepartmentId: storeByOutlet.get(t.receiverOutletId) ?? null,
          kind: "CHAIN", // all existing transfers are between outlets
        },
      });
    }
    console.log(`    • ${transfers.length} transfers updated`);
  } else {
    console.log("  ⏭  Transfer already backfilled");
  }

  // 4. Backfill PurchaseOrder.departmentId
  const poCount = await db.purchaseOrder.count({ where: { departmentId: null } });
  if (poCount > 0) {
    console.log(`  Backfilling ${poCount} PurchaseOrder rows...`);
    for (const [outletId, storeId] of storeByOutlet) {
      const updated = await db.purchaseOrder.updateMany({
        where: { outletId, departmentId: null },
        data: { departmentId: storeId },
      });
      if (updated.count > 0) console.log(`    • ${updated.count} POs → STORE of ${outletId}`);
    }
  } else {
    console.log("  ⏭  PurchaseOrder already backfilled");
  }

  console.log("─── Backfill complete ───");
  const totals = await Promise.all([
    db.department.count(),
    db.stockMovement.count({ where: { departmentId: null } }),
    db.transfer.count({ where: { OR: [{ fromDepartmentId: null }, { toDepartmentId: null }] } }),
    db.purchaseOrder.count({ where: { departmentId: null } }),
  ]);
  console.log(
    `Totals — departments:${totals[0]} · null-dept stock-movements:${totals[1]} · null-dept transfers:${totals[2]} · null-dept POs:${totals[3]}`
  );
  if (totals[1] + totals[2] + totals[3] > 0) {
    console.warn("⚠  Some rows still have null departmentId — investigate before running services that require it");
  }
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
