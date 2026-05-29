import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const outlet = await db.outlet.findFirstOrThrow();
  const defaults = [
    {
      title: "Day-start stock count",
      description: "Count raw materials and confirm opening stock for the day.",
      cadence: "DAILY",
      defaultRole: "MANAGER",
      slaMinutes: 90,
    },
    {
      title: "Day-end stock count",
      description: "Reconcile closing stock against expected (opening + receipts − sales − wastage).",
      cadence: "DAILY",
      defaultRole: "MANAGER",
      slaMinutes: 90,
    },
    {
      title: "Day-end cash drawer reconcile",
      description: "Count cash by denomination; flag variance > ₹100.",
      cadence: "DAILY",
      defaultRole: "MANAGER",
      slaMinutes: 60,
    },
    {
      title: "Weekly equipment check",
      description: "Walk-through: kitchen, fridge temps, fire safety, plumbing leaks.",
      cadence: "WEEKLY",
      defaultRole: "MANAGER",
      slaMinutes: 120,
    },
  ];
  for (const t of defaults) {
    await db.taskTemplate.upsert({
      where: { id: `tpl-${t.title.toLowerCase().replace(/\s+/g, "-")}` },
      update: {},
      create: { ...t, id: `tpl-${t.title.toLowerCase().replace(/\s+/g, "-")}`, type: "RECURRING", outletId: outlet.id },
    });
  }
  console.log(`Seeded ${defaults.length} recurring duties.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
