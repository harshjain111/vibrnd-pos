import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const orders = await db.order.findMany({ include: { items: true, kots: true } });
  let created = 0;
  for (const o of orders) {
    if (o.kots.length > 0) continue;
    const count = await db.kitchenTicket.count();
    const kotNo = `KOT-${String(count + 1).padStart(6, "0")}`;
    // Seeded orders are already PAID — mark KOTs as SERVED so KDS only shows live ones.
    const status = o.status === "PAID" ? "SERVED" : "NEW";
    await db.kitchenTicket.create({
      data: {
        kotNo,
        orderId: o.id,
        outletId: o.outletId,
        status,
        readyAt: status === "SERVED" ? o.closedAt ?? o.createdAt : null,
        servedAt: status === "SERVED" ? o.closedAt ?? o.createdAt : null,
        createdAt: o.createdAt,
        lines: {
          create: o.items.map((li) => ({
            itemId: li.itemId,
            name: li.name,
            qty: li.qty,
            status: status === "SERVED" ? "READY" : "NEW",
          })),
        },
      },
    });
    created++;
  }
  console.log(`Backfilled ${created} KOTs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
