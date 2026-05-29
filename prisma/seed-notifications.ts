import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const outlet = await db.outlet.findFirstOrThrow();
  // Backfill notifications for pending online orders
  const onlinePending = await db.order.findMany({
    where: {
      outletId: outlet.id,
      channel: { in: ["SWIGGY", "ZOMATO", "MAGICPIN", "DOTPE"] },
      status: "PLACED",
    },
  });
  for (const o of onlinePending) {
    const existing = await db.notification.findFirst({
      where: { outletId: outlet.id, kind: "ONLINE_ORDER", body: { contains: o.invoiceNo } },
    });
    if (existing) continue;
    await db.notification.create({
      data: {
        outletId: outlet.id,
        kind: "ONLINE_ORDER",
        title: `New ${o.channel} order`,
        body: `${o.aggregatorOrderId ?? o.invoiceNo} · awaiting accept`,
        link: "/orders/online",
      },
    });
  }
  // Low stock backfill
  const rms = await db.rawMaterial.findMany({ where: { outletId: outlet.id } });
  for (const r of rms.filter((x) => x.currentQty < x.minLevel)) {
    const existing = await db.notification.findFirst({
      where: { outletId: outlet.id, kind: "LOW_STOCK", body: { contains: r.name } },
    });
    if (existing) continue;
    await db.notification.create({
      data: {
        outletId: outlet.id,
        kind: "LOW_STOCK",
        title: `${r.name} below min level`,
        body: `${r.currentQty} ${r.unit} remaining (min ${r.minLevel})`,
        link: "/inventory",
      },
    });
  }
  console.log(`Backfilled notifications.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
