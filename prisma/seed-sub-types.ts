import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const outlet = await db.outlet.findFirstOrThrow();
  const types = [
    { name: "AC", parentType: "DINE_IN", rank: 1 },
    { name: "Non-AC", parentType: "DINE_IN", rank: 2 },
    { name: "Bar", parentType: "DINE_IN", rank: 3 },
    { name: "Parcel", parentType: "PICKUP", rank: 1 },
    { name: "Takeaway", parentType: "PICKUP", rank: 2 },
    { name: "Late Night", parentType: "DELIVERY", rank: 1 },
    { name: "Bulk Order", parentType: "DELIVERY", rank: 2 },
  ];
  for (const t of types) {
    await db.subOrderType.upsert({
      where: { outletId_name: { outletId: outlet.id, name: t.name } },
      update: { parentType: t.parentType, rank: t.rank, active: true },
      create: { ...t, outletId: outlet.id },
    });
  }
  console.log(`Seeded ${types.length} sub-order types.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
