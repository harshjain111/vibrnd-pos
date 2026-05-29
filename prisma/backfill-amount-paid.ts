import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // PAID orders → amountPaid = grandTotal
  const paid = await db.order.findMany({ where: { status: "PAID" } });
  for (const o of paid) {
    await db.order.update({ where: { id: o.id }, data: { amountPaid: o.grandTotal } });
  }
  // DELIVERED also fully paid (aggregator settled)
  const delivered = await db.order.findMany({ where: { status: "DELIVERED" } });
  for (const o of delivered) {
    await db.order.update({ where: { id: o.id }, data: { amountPaid: o.grandTotal } });
  }
  console.log(`Backfilled amountPaid on ${paid.length + delivered.length} orders.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
