import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const outlet = await db.outlet.findFirstOrThrow();
  const items = await db.item.findMany({ where: { outletId: outlet.id }, take: 8 });
  const tables = await db.diningTable.findMany({ where: { outletId: outlet.id } });

  const statuses: Array<"NEW" | "IN_PROGRESS" | "READY"> = ["NEW", "NEW", "IN_PROGRESS", "IN_PROGRESS", "READY"];

  // Reset live KOTs first so this is idempotent
  await db.kitchenTicket.deleteMany({
    where: { outletId: outlet.id, status: { in: ["NEW", "IN_PROGRESS", "READY"] } },
  });

  const startSeq = (await db.kitchenTicket.count()) + 1;
  const orderStart = (await db.order.count()) + 1;

  for (let i = 0; i < statuses.length; i++) {
    const st = statuses[i];
    const ageMin = i === statuses.length - 1 ? 18 : (i + 1) * 4; // last one is stale
    const created = new Date(Date.now() - ageMin * 60 * 1000);

    const sample = items.slice(i % items.length, (i % items.length) + 2 + (i % 2));
    const lines = sample.map((it) => ({ itemId: it.id, name: it.name, qty: 1 + (i % 3) }));
    const sub = sample.reduce((s, it, idx) => s + it.price * (1 + (i % 3)), 0);
    const tax = sub * 0.05;
    const total = Math.round(sub + tax);

    const order = await db.order.create({
      data: {
        invoiceNo: `INV-${String(orderStart + i).padStart(6, "0")}`,
        orderType: i % 2 === 0 ? "DINE_IN" : "PICKUP",
        status: "PRINTED",
        channel: "POS",
        subTotal: sub,
        taxTotal: tax,
        grandTotal: total,
        outletId: outlet.id,
        tableId: i % 2 === 0 ? tables[i % tables.length]?.id : undefined,
        createdAt: created,
      },
    });

    for (const li of lines) {
      await db.orderItem.create({
        data: { orderId: order.id, ...li, price: items.find((x) => x.id === li.itemId)!.price, taxRate: 5 },
      });
    }

    await db.kitchenTicket.create({
      data: {
        kotNo: `KOT-${String(startSeq + i).padStart(6, "0")}`,
        orderId: order.id,
        outletId: outlet.id,
        status: st,
        createdAt: created,
        readyAt: st === "READY" ? new Date() : null,
        lines: {
          create: lines.map((l) => ({ ...l, status: st === "READY" ? "READY" : "NEW" })),
        },
      },
    });
  }

  console.log(`Seeded ${statuses.length} live KOTs across NEW/IN_PROGRESS/READY.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
