import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const PLATFORMS = ["SWIGGY", "ZOMATO", "MAGICPIN", "DOTPE"] as const;
const FIRST = ["Aarav", "Vihaan", "Ishaan", "Reyansh", "Aditya", "Ananya", "Diya", "Saanvi", "Myra", "Aanya"];
const LAST = ["Sharma", "Patel", "Iyer", "Reddy", "Singh", "Mehta", "Verma", "Khan", "Pillai", "Joshi"];
const ADDR = [
  "204, Indiranagar 1st Stage, Bengaluru",
  "B-12, Koramangala 5th Block, Bengaluru",
  "Flat 7B, HSR Sector 2, Bengaluru",
  "12 MG Road, Brigade Gateway, Bengaluru",
  "Apt 304, Whitefield Main Road, Bengaluru",
];

function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  const outlet = await db.outlet.findFirstOrThrow();
  const items = await db.item.findMany({ where: { outletId: outlet.id } });

  // Clean prior pending online orders
  await db.order.deleteMany({
    where: {
      outletId: outlet.id,
      channel: { in: ["SWIGGY", "ZOMATO", "MAGICPIN", "DOTPE"] },
      status: { in: ["PLACED", "ACCEPTED", "FOOD_READY"] },
    },
  });

  const setups: Array<{ status: string; ageMin: number; pickedUp?: boolean }> = [
    { status: "PLACED", ageMin: 2 },
    { status: "PLACED", ageMin: 5 },
    { status: "PLACED", ageMin: 8 },
    { status: "ACCEPTED", ageMin: 11 },
    { status: "ACCEPTED", ageMin: 14 },
    { status: "FOOD_READY", ageMin: 22 },
    { status: "FOOD_READY", ageMin: 19 },
  ];

  const startSeq = (await db.order.count()) + 1;
  for (let i = 0; i < setups.length; i++) {
    const s = setups[i];
    const platform = rand(PLATFORMS);
    const created = new Date(Date.now() - s.ageMin * 60 * 1000);

    const lineCount = 1 + Math.floor(Math.random() * 3);
    const picks = Array.from({ length: lineCount }, () => rand(items));
    const lines = picks.map((it) => ({ item: it, qty: 1 + Math.floor(Math.random() * 2) }));
    const sub = lines.reduce((s, l) => s + l.item.price * l.qty, 0);
    const tax = lines.reduce((s, l) => s + l.item.price * l.qty * (l.item.taxRate / 100), 0);
    const grand = Math.round(sub + tax);

    const order = await db.order.create({
      data: {
        invoiceNo: `INV-${String(startSeq + i).padStart(6, "0")}`,
        orderType: "DELIVERY",
        status: s.status,
        channel: platform,
        subTotal: sub,
        taxTotal: tax,
        grandTotal: grand,
        paymentMode: "ONLINE",
        outletId: outlet.id,
        aggregatorOrderId: `${platform.slice(0, 3)}-${Math.floor(Math.random() * 999999)
          .toString()
          .padStart(6, "0")}`,
        deliveryAddress: rand(ADDR),
        deliveryOtp: String(1000 + Math.floor(Math.random() * 9000)),
        riderName: s.status === "FOOD_READY" ? `${rand(FIRST)} ${rand(LAST)}` : null,
        riderPhone: s.status === "FOOD_READY" ? `+9198${Math.floor(Math.random() * 100000000).toString().padStart(8, "0")}` : null,
        createdAt: created,
        items: {
          create: lines.map((l) => ({
            itemId: l.item.id,
            name: l.item.name,
            price: l.item.price,
            qty: l.qty,
            taxRate: l.item.taxRate,
          })),
        },
      },
    });

    // Generate KOT if accepted+
    if (s.status === "ACCEPTED" || s.status === "FOOD_READY") {
      const kotCount = await db.kitchenTicket.count();
      await db.kitchenTicket.create({
        data: {
          kotNo: `KOT-${String(kotCount + 1).padStart(6, "0")}`,
          orderId: order.id,
          outletId: outlet.id,
          status: s.status === "FOOD_READY" ? "READY" : "IN_PROGRESS",
          readyAt: s.status === "FOOD_READY" ? new Date() : null,
          createdAt: created,
          lines: {
            create: lines.map((l) => ({
              itemId: l.item.id,
              name: l.item.name,
              qty: l.qty,
              status: s.status === "FOOD_READY" ? "READY" : "NEW",
            })),
          },
        },
      });
    }
  }

  console.log(`Seeded ${setups.length} pending online orders across ${PLATFORMS.length} platforms.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
