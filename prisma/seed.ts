import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("Seeding...");

  const outlet = await db.outlet.upsert({
    where: { code: "SMOKZY-01" },
    update: {},
    create: {
      name: "Smokzy",
      code: "SMOKZY-01",
      address: "MG Road, Bangalore",
      phone: "+91 90000 00000",
      email: "smokzy@example.com",
      gstin: "29ABCDE1234F1Z5",
      fssai: "10012345000123",
    },
  });

  const owner = await db.user.upsert({
    where: { email: "owner@smokzy.com" },
    update: {},
    create: {
      name: "Vignesh Chettiar",
      email: "owner@smokzy.com",
      role: "OWNER",
      outletId: outlet.id,
    },
  });

  // Categories
  const catData = [
    { name: "Starters", rank: 1 },
    { name: "Main Course", rank: 2 },
    { name: "Breads", rank: 3 },
    { name: "Beverages", rank: 4 },
    { name: "Desserts", rank: 5 },
  ];
  const cats = await Promise.all(
    catData.map((c) =>
      db.category.upsert({
        where: { id: `cat-${c.name.toLowerCase().replace(/\s/g, "-")}` },
        update: {},
        create: { ...c, id: `cat-${c.name.toLowerCase().replace(/\s/g, "-")}`, outletId: outlet.id },
      })
    )
  );
  const [starters, mains, breads, bevs, desserts] = cats;

  // Items
  const items = [
    { name: "Paneer Tikka", price: 280, taxRate: 5, categoryId: starters.id, isVeg: true },
    { name: "Chicken 65", price: 320, taxRate: 5, categoryId: starters.id, isVeg: false },
    { name: "Veg Manchurian", price: 220, taxRate: 5, categoryId: starters.id, isVeg: true },
    { name: "Butter Chicken", price: 380, taxRate: 5, categoryId: mains.id, isVeg: false },
    { name: "Paneer Butter Masala", price: 320, taxRate: 5, categoryId: mains.id, isVeg: true },
    { name: "Dal Makhani", price: 240, taxRate: 5, categoryId: mains.id, isVeg: true },
    { name: "Veg Biryani", price: 260, taxRate: 5, categoryId: mains.id, isVeg: true },
    { name: "Chicken Biryani", price: 320, taxRate: 5, categoryId: mains.id, isVeg: false },
    { name: "Butter Naan", price: 60, taxRate: 5, categoryId: breads.id, isVeg: true },
    { name: "Garlic Naan", price: 70, taxRate: 5, categoryId: breads.id, isVeg: true },
    { name: "Tandoori Roti", price: 40, taxRate: 5, categoryId: breads.id, isVeg: true },
    { name: "Masala Chai", price: 50, taxRate: 5, categoryId: bevs.id, isVeg: true },
    { name: "Fresh Lime Soda", price: 80, taxRate: 5, categoryId: bevs.id, isVeg: true },
    { name: "Cold Coffee", price: 140, taxRate: 18, categoryId: bevs.id, isVeg: true },
    { name: "Gulab Jamun", price: 90, taxRate: 5, categoryId: desserts.id, isVeg: true },
    { name: "Ras Malai", price: 120, taxRate: 5, categoryId: desserts.id, isVeg: true },
  ];

  const createdItems: { id: string; name: string; price: number; taxRate: number }[] = [];
  for (const i of items) {
    const item = await db.item.upsert({
      where: { id: `item-${i.name.toLowerCase().replace(/\s/g, "-")}` },
      update: {},
      create: { ...i, id: `item-${i.name.toLowerCase().replace(/\s/g, "-")}`, outletId: outlet.id },
    });
    createdItems.push(item);
  }

  // Tables
  const tableNames = ["T1", "T2", "T3", "T4", "T5", "T6"];
  for (const name of tableNames) {
    await db.diningTable.upsert({
      where: { id: `tbl-${name.toLowerCase()}` },
      update: {},
      create: { id: `tbl-${name.toLowerCase()}`, name, outletId: outlet.id, capacity: 4 },
    });
  }

  // Customers
  const customers = [
    { name: "Rahul Sharma", phone: "+919812345670", email: "rahul@example.com" },
    { name: "Priya Iyer", phone: "+919812345671", email: "priya@example.com" },
    { name: "Akash Patel", phone: "+919812345672" },
    { name: "Neha Gupta", phone: "+919812345673", tags: "VIP,REGULAR" },
  ];
  for (const c of customers) {
    await db.customer.upsert({
      where: { id: `cust-${c.phone}` },
      update: {},
      create: { ...c, id: `cust-${c.phone}`, outletId: outlet.id },
    });
  }

  // Suppliers
  const supplier = await db.supplier.upsert({
    where: { id: "sup-1" },
    update: {},
    create: { id: "sup-1", name: "BigBasket Foods Pvt Ltd", phone: "+918012345678", gstin: "29SUPPL1234A1Z5" },
  });

  // Raw materials
  const rms = [
    { name: "Paneer", unit: "kg", parLevel: 5, minLevel: 1, currentQty: 8, avgCost: 320 },
    { name: "Chicken Breast", unit: "kg", parLevel: 10, minLevel: 2, currentQty: 12, avgCost: 280 },
    { name: "Basmati Rice", unit: "kg", parLevel: 25, minLevel: 5, currentQty: 30, avgCost: 90 },
    { name: "Onion", unit: "kg", parLevel: 20, minLevel: 5, currentQty: 4, avgCost: 30 }, // low stock
    { name: "Tomato", unit: "kg", parLevel: 15, minLevel: 3, currentQty: 18, avgCost: 25 },
    { name: "Butter", unit: "kg", parLevel: 3, minLevel: 1, currentQty: 0.5, avgCost: 500 }, // critical
    { name: "Maida (flour)", unit: "kg", parLevel: 20, minLevel: 5, currentQty: 22, avgCost: 45 },
  ];
  for (const r of rms) {
    await db.rawMaterial.upsert({
      where: { id: `rm-${r.name.toLowerCase().replace(/\s/g, "-").replace(/[^a-z0-9-]/g, "")}` },
      update: {},
      create: {
        ...r,
        id: `rm-${r.name.toLowerCase().replace(/\s/g, "-").replace(/[^a-z0-9-]/g, "")}`,
        outletId: outlet.id,
        supplierId: supplier.id,
      },
    });
  }

  // A few sample orders across last 7 days
  const now = new Date();
  const paymentModes = ["CASH", "UPI", "CARD", "ONLINE"];
  const orderTypes = ["DINE_IN", "PICKUP", "DELIVERY"];
  const invoiceCounterStart = (await db.order.count()) + 1;
  let invSeq = invoiceCounterStart;

  for (let d = 0; d < 7; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() - d);
    const ordersToday = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < ordersToday; i++) {
      const ts = new Date(day);
      ts.setHours(10 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60));
      const orderType = orderTypes[Math.floor(Math.random() * orderTypes.length)];
      const pm = paymentModes[Math.floor(Math.random() * paymentModes.length)];

      const cart: { item: typeof createdItems[number]; qty: number }[] = [];
      const lineCount = 1 + Math.floor(Math.random() * 4);
      for (let k = 0; k < lineCount; k++) {
        const item = createdItems[Math.floor(Math.random() * createdItems.length)];
        cart.push({ item, qty: 1 + Math.floor(Math.random() * 3) });
      }
      const sub = cart.reduce((s, l) => s + l.item.price * l.qty, 0);
      const tax = cart.reduce((s, l) => s + l.item.price * l.qty * (l.item.taxRate / 100), 0);
      const grand = Math.round(sub + tax);

      const order = await db.order.create({
        data: {
          invoiceNo: `INV-${String(invSeq++).padStart(6, "0")}`,
          orderType,
          status: "PAID",
          channel: "POS",
          subTotal: sub,
          taxTotal: tax,
          grandTotal: grand,
          paymentMode: pm,
          outletId: outlet.id,
          createdAt: ts,
          closedAt: ts,
        },
      });

      for (const l of cart) {
        await db.orderItem.create({
          data: {
            orderId: order.id,
            itemId: l.item.id,
            name: l.item.name,
            price: l.item.price,
            qty: l.qty,
            taxRate: l.item.taxRate,
          },
        });
      }
    }
  }

  // A few expense entries
  const expenseCats = ["RENT", "SALARY", "UTILITIES", "RAW_MATERIAL", "OTHER"];
  for (let d = 0; d < 7; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() - d);
    await db.expense.create({
      data: {
        category: expenseCats[d % expenseCats.length],
        vendor: ["BESCOM", "Landlord", "Cleaning Co", "Vegetable Mart", "Misc"][d % 5],
        amount: 500 + Math.random() * 4500,
        paymentMode: "CASH",
        outletId: outlet.id,
        createdAt: day,
      },
    });
  }

  console.log(`Done. Outlet=${outlet.name}, user=${owner.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
