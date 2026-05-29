import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const outlet = await db.outlet.findFirstOrThrow();
  const ds = [
    { code: "WELCOME10", name: "First-time visitor 10% off", type: "PERCENT", value: 10, minOrder: 200, maxDiscount: 100, active: true },
    { code: "FLAT50", name: "Flat ₹50 off above ₹500", type: "FLAT", value: 50, minOrder: 500, active: true },
    { code: "BOGO", name: "Buy 1 get 1 — Tuesdays only", type: "BOGO", value: 0, minOrder: 300, maxDiscount: 250, active: true },
    { code: "WEEKEND15", name: "Weekend special 15% off", type: "PERCENT", value: 15, minOrder: 600, maxDiscount: 150, active: false },
  ];
  for (const d of ds) {
    await db.discount.upsert({
      where: { code: d.code },
      update: { ...d },
      create: { ...d, outletId: outlet.id },
    });
  }
  console.log(`Seeded ${ds.length} discounts.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
