// KDS v2 — seed a handful of live KOTs so the /kds board renders with
// real data. Idempotent: reruns append new KOTs, doesn't dup the kitchens.
//
// Run: DATABASE_URL=... npx tsx scripts/kds-seed-demo.ts
import { PrismaClient } from "@prisma/client";
import { commentKey } from "@/lib/kds/comments";

const db = new PrismaClient();

async function main() {
  const outlet = await db.outlet.findFirst({ where: { code: "SMOKZY-01" } });
  if (!outlet) throw new Error("Run npm run db:seed first");

  const kitchens = await ensureKitchens(outlet.id);
  const K = Object.fromEntries(kitchens.map((k) => [k.code, k])) as Record<string, typeof kitchens[number]>;

  // Route existing menu items to their kitchen by name.
  const items = await db.item.findMany({ where: { outletId: outlet.id, active: true }, take: 60 });
  for (const item of items) {
    if (item.kitchenId) continue;
    let target = K.MAIN;
    const n = item.name.toLowerCase();
    if (n.includes("naan") || n.includes("kebab") || n.includes("tikka") || n.includes("tandoor")) target = K.TANDOOR;
    else if (n.includes("beverage") || n.includes("juice") || n.includes("tea") || n.includes("coffee") || n.includes("lassi") || n.includes("water")) target = K.BAR;
    else if (n.includes("dessert") || n.includes("ice") || n.includes("kulfi") || n.includes("gulab")) target = K.DESSERT;
    await db.item.update({
      where: { id: item.id },
      data: { kitchenId: target.id, prepMinutes: target.code === "BAR" ? 3 : 12 },
    });
  }

  // Grab a customer + table for the demo KOTs.
  const customer = await db.customer.findFirst({ where: { outletId: outlet.id } });
  const captain = await db.user.findFirst({ where: { outletId: outlet.id, role: { in: ["CAPTAIN", "OWNER"] } } });
  const table = await db.diningTable.findFirst({ where: { outletId: outlet.id } });
  if (!captain) throw new Error("No captain / owner user in outlet");

  // Build 4 demo KOTs across statuses.
  await punchKot(outlet.id, table?.id ?? null, captain.id, K.TANDOOR.id, "Priya", 12, [
    { name: "Chicken Tikka", qty: 1, kitchen: K.TANDOOR, comments: [
      { type: "MODIFIER", text: "Extra spicy" },
      { type: "REMOVE",   text: "Onion" },
    ]},
    { name: "Butter Naan", qty: 2, kitchen: K.TANDOOR, comments: [
      { type: "MODIFIER", text: "Extra butter" },
    ]},
    { name: "Paneer Butter Masala", qty: 1, kitchen: K.MAIN, comments: [
      { type: "MODIFIER", text: "Less spicy, less cream" },
    ]},
  ]);

  await punchKot(outlet.id, table?.id ?? null, captain.id, K.TANDOOR.id, "Zahid", 11, [
    { name: "Mutton Seekh Kebab", qty: 1, kitchen: K.TANDOOR, comments: [
      { type: "MODIFIER", text: "Well done" },
    ]},
    { name: "Butter Naan", qty: 4, kitchen: K.TANDOOR, comments: [] },
  ], { isRush: true });

  await punchKot(outlet.id, table?.id ?? null, captain.id, K.MAIN.id, "Kiran", 2, [
    { name: "Veg Wrap", qty: 1, kitchen: K.MAIN, comments: [
      { type: "REMOVE", text: "Mayo" },
    ]},
    { name: "Masala Papad", qty: 2, kitchen: K.MAIN, comments: [] },
  ]);

  await punchKot(outlet.id, table?.id ?? null, captain.id, K.DESSERT.id, "Rahul", 7, [
    { name: "Gulab Jamun", qty: 2, kitchen: K.DESSERT, comments: [
      { type: "NOTE", text: "Serve after mains" },
    ]},
  ]);

  console.log("Seeded 4 demo KOTs. Kitchens:", kitchens.map((k) => k.code).join(", "));
}

async function ensureKitchens(outletId: string) {
  const defs = [
    { code: "MAIN",    name: "Main Kitchen", sortOrder: 0 },
    { code: "TANDOOR", name: "Tandoor",      sortOrder: 1 },
    { code: "BAR",     name: "Bar & Drinks", sortOrder: 2 },
    { code: "DESSERT", name: "Dessert",      sortOrder: 3 },
  ];
  for (const d of defs) {
    await db.kitchen.upsert({
      where: { outletId_code: { outletId, code: d.code } },
      create: { ...d, outletId },
      update: {},
    });
  }
  return db.kitchen.findMany({ where: { outletId, isActive: true }, orderBy: { sortOrder: "asc" } });
}

type LineDef = {
  name: string;
  qty: number;
  kitchen: { id: string; code: string };
  comments: { type: "MODIFIER" | "ADDON" | "REMOVE" | "NOTE"; text: string; qty?: number }[];
  portion?: string;
  isVeg?: boolean;
};

async function punchKot(
  outletId: string,
  tableId: string | null,
  captainId: string,
  station: string,
  captainDisplayName: string,
  tableNumber: number,
  lines: LineDef[],
  opts: { isRush?: boolean; kotNote?: string } = {},
) {
  // Reuse or create an Order shell so KitchenTicket has an orderId.
  let order = await db.order.findFirst({
    where: { outletId, status: "RUNNING", customerName: captainDisplayName },
  });
  if (!order) {
    order = await db.order.create({
      data: {
        invoiceNo: `DEMO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        orderType: "DINE_IN",
        outletId,
        tableId,
        captainId,
        customerName: captainDisplayName,
      },
    });
  }

  // Resolve each line to a real Item.id (KitchenTicketLine has FK to Item).
  const linesResolved = [] as {
    itemId: string;
    name: string;
    qty: number;
    portion: string | null;
    isVeg: boolean;
    comments: string;
    commentKey: string;
    kitchenId: string;
    prepMinutes: number;
    status: string;
  }[];
  for (const l of lines) {
    const it = await db.item.upsert({
      where: {
        // The Item model has no unique-by-name; find or create by name+outlet.
        // Prisma can't do a compound findOrCreate cleanly, so use findFirst + create.
        id: `demo-${outletId}-${l.name.replace(/\s+/g, "-").toLowerCase()}`,
      },
      update: {},
      create: {
        id: `demo-${outletId}-${l.name.replace(/\s+/g, "-").toLowerCase()}`,
        name: l.name,
        price: 200,
        taxRate: 5,
        outletId,
        categoryId: await ensureDemoCategory(outletId),
        kitchenId: l.kitchen.id,
        prepMinutes: l.kitchen.code === "BAR" ? 3 : 12,
      },
    });
    linesResolved.push({
      itemId: it.id,
      name: l.name,
      qty: l.qty,
      portion: l.portion ?? null,
      isVeg: l.isVeg ?? true,
      comments: JSON.stringify(l.comments),
      commentKey: commentKey(l.comments),
      kitchenId: l.kitchen.id,
      prepMinutes: 10,
      status: "NEW",
    });
  }

  const kotCount = await db.kitchenTicket.count({ where: { outletId } });
  const kotNo = `KOT-${String(kotCount + 1).padStart(6, "0")}`;
  await db.kitchenTicket.create({
    data: {
      kotNo,
      orderId: order.id,
      outletId,
      station,
      status: "NEW",
      isRush: opts.isRush ?? false,
      kotNote: opts.kotNote,
      tableLabel: `Table ${tableNumber}`,
      serviceMode: "DINE_IN",
      captainId,
      punchedAt: new Date(),
      businessDate: new Date(new Date().setHours(0, 0, 0, 0)),
      lines: { create: linesResolved },
    },
  });
}

async function ensureDemoCategory(outletId: string): Promise<string> {
  const existing = await db.category.findFirst({ where: { outletId, name: "KDS Demo" } });
  if (existing) return existing.id;
  const c = await db.category.create({
    data: { outletId, name: "KDS Demo", rank: 999 },
  });
  return c.id;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
