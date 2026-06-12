import { PrismaClient } from "@prisma/client";
const seedUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const db = new PrismaClient({ datasources: { db: { url: seedUrl } } });
(async () => {
  const outlets = await db.outlet.findMany({
    include: {
      _count: {
        select: {
          orders: true,
          items: true,
          customers: true,
          fixedAssets: true,
          assetAudits: true,
        },
      },
    },
  });
  console.log("\n--- All outlets in the DB ---");
  for (const o of outlets) {
    console.log(
      `• ${o.code} | ${o.name} | active=${o.active} | orders=${o._count.orders} items=${o._count.items} customers=${o._count.customers} assets=${o._count.fixedAssets} audits=${o._count.assetAudits}`
    );
  }
  const users = await db.user.findMany({
    include: { outlet: { select: { code: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log("\n--- Users ---");
  for (const u of users) {
    console.log(`• ${u.email.padEnd(30)} role=${u.role.padEnd(8)} outlet=${u.outlet.code}`);
  }
  await db.$disconnect();
})();
