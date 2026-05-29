import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const outlet = await db.outlet.findFirstOrThrow();
  const slabs = [
    { name: "Nil", rate: 0 },
    { name: "GST 5%", rate: 5 },
    { name: "GST 12%", rate: 12 },
    { name: "GST 18%", rate: 18 },
    { name: "GST 28%", rate: 28 },
  ];
  for (const s of slabs) {
    await db.taxSlab.upsert({
      where: { outletId_name: { outletId: outlet.id, name: s.name } },
      update: { rate: s.rate, active: true },
      create: { ...s, outletId: outlet.id },
    });
  }
  console.log(`Seeded ${slabs.length} tax slabs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
