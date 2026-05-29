import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const code = "SMOKZY-02";
  const exists = await db.outlet.findUnique({ where: { code } });
  if (exists) {
    console.log(`Outlet ${code} already exists.`);
    return;
  }
  const outlet = await db.outlet.create({
    data: {
      name: "Smokzy — Indiranagar",
      code,
      address: "100ft Road, Indiranagar, Bengaluru",
      phone: "+91 80000 00000",
      email: "indiranagar@smokzy.com",
      gstin: "29ABCDE1234F2Z6",
    },
  });
  for (const name of ["Starters", "Main Course", "Breads", "Beverages", "Desserts"]) {
    await db.category.create({ data: { name, outletId: outlet.id } });
  }
  for (const [name, rate] of [["Nil", 0], ["GST 5%", 5], ["GST 12%", 12], ["GST 18%", 18]] as const) {
    await db.taxSlab.create({ data: { name, rate, outletId: outlet.id } });
  }
  console.log(`Created outlet ${outlet.name} (${outlet.code}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
