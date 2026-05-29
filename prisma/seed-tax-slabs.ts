/**
 * Seed the standard GST slabs (5/12/18/28) on every outlet that doesn't have them yet.
 * Run once via `npx tsx prisma/seed-tax-slabs.ts`. Idempotent (uses upsert by name).
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const SLABS = [
  { name: "GST 5%",  rate: 5  },
  { name: "GST 12%", rate: 12 },
  { name: "GST 18%", rate: 18 },
  { name: "GST 28%", rate: 28 },
];

async function main() {
  const outlets = await db.outlet.findMany({ select: { id: true, name: true } });
  let created = 0;
  for (const o of outlets) {
    for (const s of SLABS) {
      const existing = await db.taxSlab.findFirst({
        where: { outletId: o.id, name: s.name },
      });
      if (existing) continue;
      await db.taxSlab.create({
        data: { outletId: o.id, name: s.name, rate: s.rate, active: true },
      });
      created++;
    }
    console.log(`✓ Tax slabs ready for ${o.name}`);
  }
  console.log(`\nDone. ${created} slab(s) inserted across ${outlets.length} outlet(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
