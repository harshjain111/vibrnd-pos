import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const outlet = await db.outlet.findFirstOrThrow();
  const tables = await db.diningTable.findMany({ where: { outletId: outlet.id } });
  const items = await db.item.findMany({ where: { outletId: outlet.id }, take: 6 });

  // Clean up any prior demo running orders (status RUNNING/SAVED/PRINTED with no payment)
  await db.order.deleteMany({
    where: { outletId: outlet.id, status: { in: ["RUNNING", "SAVED"] } },
  });

  const orderCount = await db.order.count();
  let seq = orderCount + 1;

  // T1 — occupied, running, no KOT-ready yet
  // T3 — food ready (one KOT marked READY)
  // T5 — bill printed but not paid (due)
  const setups = [
    { tableIdx: 0, status: "RUNNING", kotStatus: "IN_PROGRESS" },
    { tableIdx: 2, status: "RUNNING", kotStatus: "READY" },
    { tableIdx: 4, status: "PRINTED", kotStatus: "SERVED" },
  ];

  for (const s of setups) {
    const tbl = tables[s.tableIdx];
    if (!tbl) continue;
    const sample = items.slice(0, 3);
    const sub = sample.reduce((acc, it) => acc + it.price * 1, 0);
    const tax = sub * 0.05;
    const total = Math.round(sub + tax);

    const order = await db.order.create({
      data: {
        invoiceNo: `INV-${String(seq++).padStart(6, "0")}`,
        orderType: "DINE_IN",
        status: s.status,
        channel: "POS",
        tableId: tbl.id,
        subTotal: sub,
        taxTotal: tax,
        grandTotal: total,
        outletId: outlet.id,
        items: {
          create: sample.map((it) => ({
            itemId: it.id,
            name: it.name,
            price: it.price,
            qty: 1,
            taxRate: it.taxRate,
          })),
        },
      },
    });

    const kotCount = await db.kitchenTicket.count();
    await db.kitchenTicket.create({
      data: {
        kotNo: `KOT-${String(kotCount + 1).padStart(6, "0")}`,
        orderId: order.id,
        outletId: outlet.id,
        status: s.kotStatus,
        readyAt: s.kotStatus === "READY" || s.kotStatus === "SERVED" ? new Date() : null,
        servedAt: s.kotStatus === "SERVED" ? new Date() : null,
        lines: {
          create: sample.map((it) => ({ itemId: it.id, name: it.name, qty: 1 })),
        },
      },
    });
  }
  console.log(`Seeded ${setups.length} running dine-in orders.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
