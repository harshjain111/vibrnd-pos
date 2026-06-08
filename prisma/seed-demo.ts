/**
 * Demo data seed — idempotent. Run with `npm run db:demo`.
 *
 * Populates every module with realistic test data so the user can click through
 * the app and see populated screens:
 *   • Customers + loyalty wallets + tags + allergies + birthdays
 *   • Menu (categories + items + variants + addons) — extends the base seed
 *   • Raw materials + suppliers + a sample purchase
 *   • Settled orders across the last 14 days with KOTs + items + payments
 *   • Live (RUNNING) orders so KDS + Live Orders aren't empty
 *   • Online orders from Swiggy / Zomato
 *   • Held bills
 *   • Cash drawer entries (opening + sales + expenses)
 *   • Expenses (mix of approved + pending)
 *   • Discounts + gift cards + memberships
 *   • Feedback (mix of resolved + open)
 *   • Tasks (open + overdue + done)
 *   • Notifications (low stock + online order)
 *   • Fixed assets register + a past audit with variance
 *
 * Safe to re-run — uses upserts on deterministic IDs and skips creating
 * orders if more than 200 already exist (to avoid runaway growth on repeat).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Use the DIRECT_URL (port 5432, no pgbouncer pooling) — the pooled URL caps
// at connection_limit=1 which throttles bulk inserts to a crawl. Fall back
// to DATABASE_URL if DIRECT_URL is unset.
const seedUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const db = new PrismaClient({ datasources: { db: { url: seedUrl } } });

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pad(n: number, w = 6) {
  return String(n).padStart(w, "0");
}
function daysAgo(n: number, hour = 12, min = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, min, 0, 0);
  return d;
}

async function main() {
  console.log("─── Demo seed starting ───");

  // ── 1. Outlet (reuse base) ─────────────────────────────────────────────
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
      upiVpa: "smokzy@hdfcbank",
    },
  });
  console.log(`✓ outlet ${outlet.name}`);

  // ── 2. Users for each role (so RBAC can be tested) ─────────────────────
  const passHash = await bcrypt.hash("password123", 10);
  const userSpecs: { id: string; name: string; email: string; role: string }[] = [
    { id: "u-owner", name: "Vignesh Chettiar", email: "owner@smokzy.com", role: "OWNER" },
    { id: "u-manager", name: "Anand Manager", email: "manager@smokzy.com", role: "MANAGER" },
    { id: "u-biller", name: "Suresh Biller", email: "biller@smokzy.com", role: "BILLER" },
    { id: "u-captain1", name: "Karthik Captain", email: "captain@smokzy.com", role: "CAPTAIN" },
    { id: "u-captain2", name: "Priya Captain", email: "captain2@smokzy.com", role: "CAPTAIN" },
  ];
  for (const u of userSpecs) {
    // Upsert by email (the unique key); keep id stable so cross-refs (createdById etc.) work.
    const existing = await db.user.findUnique({ where: { email: u.email } });
    if (existing) {
      await db.user.update({
        where: { id: existing.id },
        data: { name: u.name, role: u.role, outletId: outlet.id, active: true },
      });
      // Patch the spec id so downstream relations use the existing user id.
      u.id = existing.id;
    } else {
      await db.user.create({
        data: { ...u, passwordHash: passHash, outletId: outlet.id, active: true },
      });
    }
  }
  console.log(`✓ users (${userSpecs.length})`);

  // Look up real DB ids for users — upsert-by-email may have reassigned them.
  const userByEmail = new Map(
    (await db.user.findMany({ where: { email: { in: userSpecs.map((u) => u.email) } } }))
      .map((u) => [u.email, u.id] as const)
  );
  const uid = (email: string) => userByEmail.get(email)!;
  const U_OWNER = uid("owner@smokzy.com");
  const U_MANAGER = uid("manager@smokzy.com");
  const U_BILLER = uid("biller@smokzy.com");
  const U_CAPTAIN1 = uid("captain@smokzy.com");
  const U_CAPTAIN2 = uid("captain2@smokzy.com");

  // ── 3. Tables (10 across 2 areas) ──────────────────────────────────────
  const tableSpecs = [
    { id: "tbl-a1", name: "A1", area: "Hall A", capacity: 2 },
    { id: "tbl-a2", name: "A2", area: "Hall A", capacity: 4 },
    { id: "tbl-a3", name: "A3", area: "Hall A", capacity: 4 },
    { id: "tbl-a4", name: "A4", area: "Hall A", capacity: 6 },
    { id: "tbl-b1", name: "B1", area: "Hall B", capacity: 4 },
    { id: "tbl-b2", name: "B2", area: "Hall B", capacity: 4 },
    { id: "tbl-b3", name: "B3", area: "Hall B", capacity: 6 },
    { id: "tbl-p1", name: "P1", area: "Patio", capacity: 4 },
    { id: "tbl-p2", name: "P2", area: "Patio", capacity: 4 },
    { id: "tbl-p3", name: "P3", area: "Patio", capacity: 2 },
  ];
  for (const t of tableSpecs) {
    await db.diningTable.upsert({
      where: { id: t.id },
      update: { name: t.name, area: t.area, capacity: t.capacity },
      create: { ...t, outletId: outlet.id },
    });
  }
  console.log(`✓ tables (${tableSpecs.length})`);

  // ── 4. Categories + items (extends base) ───────────────────────────────
  const catSpecs = [
    { id: "cat-starters", name: "Starters", rank: 1 },
    { id: "cat-main-course", name: "Main Course", rank: 2 },
    { id: "cat-breads", name: "Breads", rank: 3 },
    { id: "cat-rice-biryani", name: "Rice & Biryani", rank: 4 },
    { id: "cat-beverages", name: "Beverages", rank: 5 },
    { id: "cat-desserts", name: "Desserts", rank: 6 },
  ];
  for (const c of catSpecs) {
    await db.category.upsert({
      where: { id: c.id },
      update: { name: c.name, rank: c.rank },
      create: { ...c, outletId: outlet.id },
    });
  }

  const itemSpecs = [
    // Starters
    { id: "item-paneer-tikka", name: "Paneer Tikka", price: 280, taxRate: 5, categoryId: "cat-starters", isVeg: true },
    { id: "item-chicken-65", name: "Chicken 65", price: 320, taxRate: 5, categoryId: "cat-starters", isVeg: false },
    { id: "item-veg-manchurian", name: "Veg Manchurian", price: 220, taxRate: 5, categoryId: "cat-starters", isVeg: true },
    { id: "item-tandoori-chicken", name: "Tandoori Chicken (Half)", price: 380, taxRate: 5, categoryId: "cat-starters", isVeg: false },
    // Main course
    { id: "item-butter-chicken", name: "Butter Chicken", price: 380, taxRate: 5, categoryId: "cat-main-course", isVeg: false },
    { id: "item-paneer-butter-masala", name: "Paneer Butter Masala", price: 320, taxRate: 5, categoryId: "cat-main-course", isVeg: true },
    { id: "item-dal-makhani", name: "Dal Makhani", price: 240, taxRate: 5, categoryId: "cat-main-course", isVeg: true },
    { id: "item-kadhai-paneer", name: "Kadhai Paneer", price: 300, taxRate: 5, categoryId: "cat-main-course", isVeg: true },
    // Rice & Biryani
    { id: "item-veg-biryani", name: "Veg Biryani", price: 260, taxRate: 5, categoryId: "cat-rice-biryani", isVeg: true },
    { id: "item-chicken-biryani", name: "Chicken Biryani", price: 320, taxRate: 5, categoryId: "cat-rice-biryani", isVeg: false },
    { id: "item-jeera-rice", name: "Jeera Rice", price: 180, taxRate: 5, categoryId: "cat-rice-biryani", isVeg: true },
    // Breads
    { id: "item-butter-naan", name: "Butter Naan", price: 60, taxRate: 5, categoryId: "cat-breads", isVeg: true },
    { id: "item-garlic-naan", name: "Garlic Naan", price: 70, taxRate: 5, categoryId: "cat-breads", isVeg: true },
    { id: "item-tandoori-roti", name: "Tandoori Roti", price: 40, taxRate: 5, categoryId: "cat-breads", isVeg: true },
    // Beverages
    { id: "item-masala-chai", name: "Masala Chai", price: 50, taxRate: 5, categoryId: "cat-beverages", isVeg: true },
    { id: "item-fresh-lime-soda", name: "Fresh Lime Soda", price: 80, taxRate: 5, categoryId: "cat-beverages", isVeg: true },
    { id: "item-cold-coffee", name: "Cold Coffee", price: 140, taxRate: 18, categoryId: "cat-beverages", isVeg: true },
    { id: "item-mango-lassi", name: "Mango Lassi", price: 120, taxRate: 5, categoryId: "cat-beverages", isVeg: true },
    // Desserts
    { id: "item-gulab-jamun", name: "Gulab Jamun (2 pc)", price: 90, taxRate: 5, categoryId: "cat-desserts", isVeg: true },
    { id: "item-ras-malai", name: "Ras Malai", price: 120, taxRate: 5, categoryId: "cat-desserts", isVeg: true },
  ];
  for (const i of itemSpecs) {
    await db.item.upsert({
      where: { id: i.id },
      update: { name: i.name, price: i.price, taxRate: i.taxRate, categoryId: i.categoryId, isVeg: i.isVeg },
      create: { ...i, outletId: outlet.id },
    });
  }
  console.log(`✓ menu: ${catSpecs.length} cats / ${itemSpecs.length} items`);

  // Variants on biryani + tandoori chicken (absolute price)
  const variantSpecs = [
    { id: "var-biryani-half", itemId: "item-chicken-biryani", name: "Half", price: 240 },
    { id: "var-biryani-full", itemId: "item-chicken-biryani", name: "Full", price: 320 },
    { id: "var-tandoori-full", itemId: "item-tandoori-chicken", name: "Full", price: 700 },
  ];
  for (const v of variantSpecs) {
    await db.itemVariant.upsert({
      where: { id: v.id },
      update: { name: v.name, price: v.price },
      create: v,
    });
  }
  const addonSpecs = [
    { id: "addon-extra-cheese", itemId: "item-paneer-butter-masala", name: "Extra Cheese", priceDelta: 40 },
    { id: "addon-extra-raita", itemId: "item-chicken-biryani", name: "Extra Raita", priceDelta: 25 },
  ];
  for (const a of addonSpecs) {
    await db.addon.upsert({
      where: { id: a.id },
      update: { name: a.name, priceDelta: a.priceDelta },
      create: a,
    });
  }

  // ── 5. Customers with loyalty + profile fields ─────────────────────────
  const customerSpecs = [
    {
      id: "cust-rahul",
      name: "Rahul Sharma",
      phone: "+919812345670",
      email: "rahul@example.com",
      tags: "VIP,REGULAR",
      allergies: "Peanuts",
      birthday: new Date("1990-06-15"),
      loyaltyPoints: 420,
    },
    {
      id: "cust-priya",
      name: "Priya Iyer",
      phone: "+919812345671",
      email: "priya@example.com",
      tags: "REGULAR",
      birthday: new Date("1988-11-23"),
      anniversary: new Date("2015-02-14"),
      loyaltyPoints: 180,
    },
    {
      id: "cust-akash",
      name: "Akash Patel",
      phone: "+919812345672",
      loyaltyPoints: 60,
    },
    {
      id: "cust-neha",
      name: "Neha Gupta",
      phone: "+919812345673",
      tags: "VIP,GOLD",
      allergies: "Lactose intolerant",
      birthday: new Date("1992-03-08"),
      loyaltyPoints: 2150,
    },
    {
      id: "cust-arjun",
      name: "Arjun Reddy",
      phone: "+919812345674",
      email: "arjun.r@example.com",
      tags: "REGULAR",
      loyaltyPoints: 95,
    },
    {
      id: "cust-meera",
      name: "Meera Kapoor",
      phone: "+919812345675",
      tags: "SILVER",
      birthday: new Date("1985-09-30"),
      loyaltyPoints: 720,
    },
  ];
  for (const c of customerSpecs) {
    await db.customer.upsert({
      where: { id: c.id },
      update: {
        name: c.name,
        phone: c.phone,
        email: c.email,
        tags: c.tags,
        allergies: c.allergies,
        birthday: c.birthday,
        anniversary: c.anniversary,
        loyaltyPoints: c.loyaltyPoints,
      },
      create: { ...c, outletId: outlet.id },
    });
  }
  console.log(`✓ customers (${customerSpecs.length})`);

  // ── 6. Suppliers + raw materials + a sample purchase ───────────────────
  const suppliers = [
    { id: "sup-bigbasket", name: "BigBasket Foods Pvt Ltd", phone: "+918012345678", gstin: "29SUPPL1234A1Z5" },
    { id: "sup-fresh-veg", name: "Fresh Veg Market", phone: "+918012345679" },
    { id: "sup-poultry", name: "Sunrise Poultry", phone: "+918012345680" },
  ];
  for (const s of suppliers) {
    await db.supplier.upsert({ where: { id: s.id }, update: { name: s.name, phone: s.phone, gstin: s.gstin ?? null }, create: s });
  }

  const rmSpecs = [
    { id: "rm-paneer", name: "Paneer", unit: "kg", parLevel: 5, minLevel: 1, currentQty: 8, avgCost: 320 },
    { id: "rm-chicken-breast", name: "Chicken Breast", unit: "kg", parLevel: 10, minLevel: 2, currentQty: 12, avgCost: 280 },
    { id: "rm-basmati-rice", name: "Basmati Rice", unit: "kg", parLevel: 25, minLevel: 5, currentQty: 30, avgCost: 90 },
    { id: "rm-onion", name: "Onion", unit: "kg", parLevel: 20, minLevel: 5, currentQty: 4, avgCost: 30 }, // low
    { id: "rm-tomato", name: "Tomato", unit: "kg", parLevel: 15, minLevel: 3, currentQty: 18, avgCost: 25 },
    { id: "rm-butter", name: "Butter", unit: "kg", parLevel: 3, minLevel: 1, currentQty: 0.5, avgCost: 500 }, // critical
    { id: "rm-maida", name: "Maida (flour)", unit: "kg", parLevel: 20, minLevel: 5, currentQty: 22, avgCost: 45 },
    { id: "rm-milk", name: "Milk", unit: "L", parLevel: 30, minLevel: 5, currentQty: 28, avgCost: 60 },
    { id: "rm-sugar", name: "Sugar", unit: "kg", parLevel: 10, minLevel: 2, currentQty: 8, avgCost: 45 },
    { id: "rm-tea-powder", name: "Tea Powder", unit: "kg", parLevel: 5, minLevel: 1, currentQty: 3.5, avgCost: 600 },
  ];
  for (const r of rmSpecs) {
    await db.rawMaterial.upsert({
      where: { id: r.id },
      update: {
        name: r.name,
        unit: r.unit,
        parLevel: r.parLevel,
        minLevel: r.minLevel,
        currentQty: r.currentQty,
        avgCost: r.avgCost,
      },
      create: { ...r, outletId: outlet.id, supplierId: "sup-bigbasket" },
    });
  }
  console.log(`✓ raw materials (${rmSpecs.length})`);

  // ── 7. Discounts ───────────────────────────────────────────────────────
  const discountSpecs = [
    { id: "disc-welcome10", code: "WELCOME10", name: "Welcome 10% off", type: "PERCENT", value: 10, minOrder: 500 },
    { id: "disc-flat50", code: "FLAT50", name: "₹50 off above ₹400", type: "FLAT", value: 50, minOrder: 400 },
    { id: "disc-weekend20", code: "WEEKEND20", name: "Weekend 20% off", type: "PERCENT", value: 20, minOrder: 1000, isAuto: true, daysOfWeek: "SAT,SUN" },
  ];
  for (const d of discountSpecs) {
    await db.discount.upsert({
      where: { id: d.id },
      update: { code: d.code, name: d.name, type: d.type, value: d.value, minOrder: d.minOrder, active: true },
      create: { ...d, active: true, outletId: outlet.id },
    });
  }

  // ── 8. Settled orders across last 14 days (BATCHED via createMany) ────
  const existingOrderCount = await db.order.count({ where: { outletId: outlet.id } });
  if (existingOrderCount < 100) {
    const items = await db.item.findMany({ where: { outletId: outlet.id } });
    const customerIds = customerSpecs.map((c) => c.id);
    const captainIds = [U_CAPTAIN1, U_CAPTAIN2];
    const tableIds = tableSpecs.map((t) => t.id);
    const channels = [
      { channel: "POS", orderType: "DINE_IN" },
      { channel: "POS", orderType: "DINE_IN" },
      { channel: "POS", orderType: "DINE_IN" },
      { channel: "POS", orderType: "PICKUP" },
      { channel: "SWIGGY", orderType: "DELIVERY" },
      { channel: "ZOMATO", orderType: "DELIVERY" },
    ];
    const paymentModes = ["CASH", "UPI", "CARD", "UPI", "UPI"];
    const startSeq = existingOrderCount + 1;
    let seq = startSeq;

    // Build everything in memory first.
    type OrderRow = {
      id: string;
      invoiceNo: string;
      orderType: string;
      channel: string;
      status: string;
      subTotal: number;
      taxTotal: number;
      grandTotal: number;
      amountPaid: number;
      paymentMode: string;
      customerId: string | null;
      tableId: string | null;
      captainId: string | null;
      outletId: string;
      createdAt: Date;
      closedAt: Date;
      locality: string | null;
      aggregatorOrderId: string | null;
    };
    const orderRows: OrderRow[] = [];
    const itemRows: { orderId: string; itemId: string; name: string; price: number; qty: number; taxRate: number }[] = [];
    const paymentRows: { orderId: string; mode: string; amount: number; outletId: string; createdAt: Date }[] = [];

    function cuid() {
      return "c" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-8);
    }

    for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
      const ordersToday = 8 + Math.floor(Math.random() * 6);
      for (let i = 0; i < ordersToday; i++) {
        const hour = 11 + Math.floor(Math.random() * 12);
        const min = Math.floor(Math.random() * 60);
        const ts = daysAgo(dayOffset, hour, min);
        const channel = rand(channels);
        const lineCount = 1 + Math.floor(Math.random() * 5);
        const cart: { item: typeof items[number]; qty: number }[] = [];
        for (let k = 0; k < lineCount; k++) {
          cart.push({ item: rand(items), qty: 1 + Math.floor(Math.random() * 3) });
        }
        const sub = cart.reduce((s, l) => s + l.item.price * l.qty, 0);
        const tax = Math.round(cart.reduce((s, l) => s + l.item.price * l.qty * (l.item.taxRate / 100), 0));
        const serviceCharge = channel.orderType === "DINE_IN" ? Math.round(sub * 0.1) : 0;
        const grand = Math.round(sub + tax + serviceCharge);
        const pm = rand(paymentModes);
        const useCustomer = Math.random() < 0.6;
        const orderId = cuid();
        orderRows.push({
          id: orderId,
          invoiceNo: `INV-${pad(seq++)}`,
          orderType: channel.orderType,
          channel: channel.channel,
          status: "PAID",
          subTotal: sub,
          taxTotal: tax,
          grandTotal: grand,
          amountPaid: grand,
          paymentMode: pm,
          customerId: useCustomer ? rand(customerIds) : null,
          tableId: channel.orderType === "DINE_IN" ? rand(tableIds) : null,
          captainId: channel.orderType === "DINE_IN" ? rand(captainIds) : null,
          outletId: outlet.id,
          createdAt: ts,
          closedAt: ts,
          locality: channel.orderType === "DELIVERY" ? rand(["Indiranagar", "Koramangala", "HSR Layout", "BTM", "Whitefield"]) : null,
          aggregatorOrderId: channel.channel !== "POS" ? `${channel.channel.slice(0, 3)}-${Math.floor(100000 + Math.random() * 900000)}` : null,
        });
        for (const l of cart) {
          itemRows.push({
            orderId,
            itemId: l.item.id,
            name: l.item.name,
            price: l.item.price,
            qty: l.qty,
            taxRate: l.item.taxRate,
          });
        }
        paymentRows.push({ orderId, mode: pm, amount: grand, outletId: outlet.id, createdAt: ts });
      }
    }

    // Bulk insert — three round-trips total instead of N×3.
    await db.order.createMany({ data: orderRows, skipDuplicates: true });
    // OrderItem/Payment don't allow extra ids in createMany — fine, db assigns.
    await db.orderItem.createMany({ data: itemRows });
    await db.payment.createMany({ data: paymentRows });
    console.log(`✓ ${orderRows.length} settled orders across 14 days (bulk)`);
  } else {
    console.log(`⏭  settled orders (already ${existingOrderCount} present)`);
  }

  // ── 9. Live RUNNING orders (so KDS + Live Orders aren't empty) ────────
  const liveCount = await db.order.count({ where: { outletId: outlet.id, status: "RUNNING" } });
  if (liveCount < 3) {
    const items = await db.item.findMany({ where: { outletId: outlet.id } });
    const liveSpecs = [
      { tableId: "tbl-a2", captainId: U_CAPTAIN1, picks: ["item-butter-chicken", "item-butter-naan", "item-butter-naan", "item-jeera-rice"] },
      { tableId: "tbl-b1", captainId: U_CAPTAIN2, picks: ["item-paneer-tikka", "item-veg-biryani", "item-mango-lassi"] },
      { tableId: "tbl-p1", captainId: U_CAPTAIN1, picks: ["item-tandoori-chicken", "item-garlic-naan", "item-fresh-lime-soda"] },
    ];
    let seq = (await db.order.count()) + 1;
    for (const spec of liveSpecs) {
      const cart = spec.picks.map((id) => items.find((i) => i.id === id)!).filter(Boolean);
      const sub = cart.reduce((s, it) => s + it.price, 0);
      const tax = Math.round(cart.reduce((s, it) => s + it.price * (it.taxRate / 100), 0));
      const order = await db.order.create({
        data: {
          invoiceNo: `INV-${pad(seq++)}`,
          orderType: "DINE_IN",
          channel: "POS",
          status: "RUNNING",
          subTotal: sub,
          taxTotal: tax,
          grandTotal: sub + tax,
          tableId: spec.tableId,
          captainId: spec.captainId,
          outletId: outlet.id,
          createdAt: new Date(Date.now() - Math.floor(Math.random() * 30 * 60 * 1000)),
        },
      });
      for (const it of cart) {
        await db.orderItem.create({
          data: { orderId: order.id, itemId: it.id, name: it.name, price: it.price, qty: 1, taxRate: it.taxRate },
        });
      }
      // One KOT marked NEW so KDS lights up.
      const kotNo = `KOT-${pad(seq, 5)}-${Math.floor(Math.random() * 100)}`;
      const kot = await db.kitchenTicket.create({
        data: {
          kotNo,
          orderId: order.id,
          status: "NEW",
          station: "MAIN",
          outletId: outlet.id,
        },
      });
      for (const it of cart) {
        await db.kitchenTicketLine.create({
          data: { ticketId: kot.id, itemId: it.id, name: it.name, qty: 1 },
        });
      }
    }
    console.log(`✓ ${liveSpecs.length} live orders with KOTs`);
  } else {
    console.log(`⏭  live orders (already ${liveCount} present)`);
  }

  // ── 10. Online orders inbox (Swiggy/Zomato PLACED) ────────────────────
  const placedCount = await db.order.count({ where: { outletId: outlet.id, status: "PLACED" } });
  if (placedCount < 2) {
    const items = await db.item.findMany({ where: { outletId: outlet.id } });
    let seq = (await db.order.count()) + 1;
    for (const ch of ["SWIGGY", "ZOMATO"]) {
      const picks = [rand(items), rand(items), rand(items)];
      const sub = picks.reduce((s, i) => s + i.price, 0);
      const tax = Math.round(picks.reduce((s, i) => s + i.price * (i.taxRate / 100), 0));
      await db.order.create({
        data: {
          invoiceNo: `INV-${pad(seq++)}`,
          orderType: "DELIVERY",
          channel: ch,
          status: "PLACED",
          subTotal: sub,
          taxTotal: tax,
          grandTotal: sub + tax,
          aggregatorOrderId: `${ch.slice(0, 3)}-${Math.floor(100000 + Math.random() * 900000)}`,
          deliveryAddress: ch === "SWIGGY" ? "302, Brigade Gardens, Indiranagar" : "12A, 5th Cross, Koramangala 4B",
          riderName: ch === "SWIGGY" ? "Vivek" : "Sandeep",
          riderPhone: "+919898989898",
          locality: ch === "SWIGGY" ? "Indiranagar" : "Koramangala",
          outletId: outlet.id,
          items: {
            create: picks.map((i) => ({
              itemId: i.id,
              name: i.name,
              price: i.price,
              qty: 1,
              taxRate: i.taxRate,
            })),
          },
        },
      });
    }
    console.log(`✓ 2 incoming online orders`);
  }

  // ── 11. Cash drawer entries for today ─────────────────────────────────
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const todaysCash = await db.cashEntry.count({
    where: { outletId: outlet.id, createdAt: { gte: todayMidnight } },
  });
  if (todaysCash === 0) {
    await db.cashEntry.createMany({
      data: [
        { kind: "OPENING", amount: 2000, reason: "Float", outletId: outlet.id, createdAt: daysAgo(0, 8, 0) },
        { kind: "TOP_UP", amount: 5000, reason: "From safe", outletId: outlet.id, createdAt: daysAgo(0, 14, 0) },
        { kind: "WITHDRAWAL", amount: 1500, reason: "Vegetable purchase", outletId: outlet.id, createdAt: daysAgo(0, 16, 0) },
      ],
    });
    console.log(`✓ cash drawer entries`);
  }

  // ── 12. Expenses (mix of pending + approved) ──────────────────────────
  const expenseCount = await db.expense.count({ where: { outletId: outlet.id } });
  if (expenseCount < 10) {
    const expenseSpecs = [
      { category: "RENT", vendor: "Landlord", amount: 45000, status: "APPROVED", daysOld: 5 },
      { category: "SALARY", vendor: "Chef Salaries", amount: 38000, status: "APPROVED", daysOld: 4 },
      { category: "UTILITIES", vendor: "BESCOM", amount: 6800, status: "APPROVED", daysOld: 3 },
      { category: "RAW_MATERIAL", vendor: "Fresh Veg Market", amount: 2300, status: "PENDING_AUDITOR", daysOld: 2 },
      { category: "RAW_MATERIAL", vendor: "Sunrise Poultry", amount: 5400, status: "PENDING_MANAGER", daysOld: 1 },
      { category: "OTHER", vendor: "Pest Control Co.", amount: 1200, status: "APPROVED", daysOld: 7 },
      { category: "UTILITIES", vendor: "Water Tank", amount: 800, status: "APPROVED", daysOld: 6 },
      { category: "OTHER", vendor: "Misc", amount: 450, status: "PENDING_MANAGER", daysOld: 0 },
    ];
    for (const e of expenseSpecs) {
      await db.expense.create({
        data: {
          category: e.category,
          vendor: e.vendor,
          amount: e.amount,
          paymentMode: "CASH",
          status: e.status,
          managerApprovedById: e.status !== "PENDING_MANAGER" ? U_MANAGER : null,
          managerApprovedAt: e.status !== "PENDING_MANAGER" ? daysAgo(e.daysOld, 10, 0) : null,
          auditorApprovedById: e.status === "APPROVED" ? U_OWNER : null,
          auditorApprovedAt: e.status === "APPROVED" ? daysAgo(e.daysOld, 18, 0) : null,
          createdById: U_BILLER,
          outletId: outlet.id,
          createdAt: daysAgo(e.daysOld, 9, 0),
        },
      });
    }
    console.log(`✓ ${expenseSpecs.length} expenses`);
  }

  // ── 13. Gift cards ────────────────────────────────────────────────────
  const giftCardCount = await db.giftCard.count({ where: { outletId: outlet.id } });
  if (giftCardCount === 0) {
    const cards = [
      { code: "GC-BIRTHDAY-001", initialAmount: 1000, balance: 750, customerId: "cust-rahul" },
      { code: "GC-WEDDING-002", initialAmount: 2000, balance: 2000, customerId: "cust-priya" },
      { code: "GC-LOYALTY-003", initialAmount: 500, balance: 0, customerId: "cust-neha" },
    ];
    for (const c of cards) {
      const card = await db.giftCard.create({
        data: {
          ...c,
          active: c.balance > 0,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          outletId: outlet.id,
        },
      });
      await db.giftCardTxn.create({
        data: { cardId: card.id, kind: "ISSUE", amount: c.initialAmount, actor: "owner@smokzy.com" },
      });
      if (c.balance < c.initialAmount) {
        await db.giftCardTxn.create({
          data: { cardId: card.id, kind: "REDEEM", amount: -(c.initialAmount - c.balance), actor: "biller@smokzy.com" },
        });
      }
    }
    console.log(`✓ ${cards.length} gift cards`);
  }

  // ── 14. Memberships ───────────────────────────────────────────────────
  const planCount = await db.membershipPlan.count({ where: { outletId: outlet.id } });
  if (planCount === 0) {
    const plan = await db.membershipPlan.create({
      data: {
        name: "Smokzy Gold Annual",
        price: 999,
        durationDays: 365,
        outletId: outlet.id,
      },
    });
    await db.membershipBenefit.createMany({
      data: [
        { planId: plan.id, name: "Free Masala Chai daily", itemId: "item-masala-chai", qtyPerDay: 1 },
        { planId: plan.id, name: "Free Gulab Jamun on birthday", itemId: "item-gulab-jamun", qtyPerDay: 2 },
      ],
    });
    // Issue membership to Neha + Rahul
    await db.membership.create({
      data: {
        customerId: "cust-neha",
        planId: plan.id,
        startsAt: daysAgo(60),
        expiresAt: new Date(Date.now() + 305 * 24 * 60 * 60 * 1000),
        active: true,
      },
    });
    await db.membership.create({
      data: {
        customerId: "cust-rahul",
        planId: plan.id,
        startsAt: daysAgo(120),
        expiresAt: new Date(Date.now() + 245 * 24 * 60 * 60 * 1000),
        active: true,
      },
    });
    console.log(`✓ membership plan + 2 active memberships`);
  }

  // ── 15. Feedback ──────────────────────────────────────────────────────
  const feedbackCount = await db.feedback.count({ where: { outletId: outlet.id } });
  if (feedbackCount === 0) {
    const fb = [
      { category: "FOOD", rating: 5, text: "Butter chicken was top notch!", resolved: true, daysOld: 2, customerId: "cust-rahul" },
      { category: "SERVICE", rating: 2, text: "Waited 30 minutes for our order", resolved: false, daysOld: 1, customerId: "cust-priya" },
      { category: "AMBIANCE", rating: 4, text: "Cosy but a bit loud", resolved: true, daysOld: 3, customerId: "cust-akash" },
      { category: "DELIVERY", rating: 1, text: "Delivery arrived cold", resolved: false, daysOld: 0, customerId: null },
      { category: "FOOD", rating: 5, text: "Best biryani in Bangalore", resolved: true, daysOld: 5, customerId: "cust-neha" },
    ];
    for (const f of fb) {
      await db.feedback.create({
        data: {
          category: f.category,
          rating: f.rating,
          text: f.text,
          resolved: f.resolved,
          resolvedNote: f.resolved ? "Acknowledged with customer" : null,
          customerId: f.customerId,
          outletId: outlet.id,
          createdAt: daysAgo(f.daysOld, 19, 30),
        },
      });
    }
    console.log(`✓ ${fb.length} feedback entries`);
  }

  // ── 16. Tasks ─────────────────────────────────────────────────────────
  const taskCount = await db.task.count({ where: { outletId: outlet.id } });
  if (taskCount === 0) {
    await db.task.createMany({
      data: [
        {
          title: "Clean exhaust hood",
          type: "RECURRING",
          status: "OPEN",
          assignedRole: "MANAGER",
          dueAt: daysAgo(-1, 18, 0),
          outletId: outlet.id,
        },
        {
          title: "Order onions — running low",
          type: "ADHOC",
          status: "OPEN",
          assignedRole: "MANAGER",
          dueAt: daysAgo(-1, 12, 0),
          outletId: outlet.id,
        },
        {
          title: "Replenish butter — critical",
          type: "ADHOC",
          status: "OVERDUE",
          assignedRole: "MANAGER",
          dueAt: daysAgo(1, 18, 0),
          outletId: outlet.id,
        },
        {
          title: "Verify cash drawer",
          type: "RECURRING",
          status: "DONE",
          assignedRole: "BILLER",
          assignedToId: U_BILLER,
          dueAt: daysAgo(0, 23, 0),
          completedAt: daysAgo(0, 22, 45),
          outletId: outlet.id,
        },
      ],
    });
    console.log(`✓ tasks (4)`);
  }

  // ── 17. Notifications (anti-theft + low stock + new online order) ─────
  const notifCount = await db.notification.count({ where: { outletId: outlet.id } });
  if (notifCount < 3) {
    await db.notification.createMany({
      data: [
        {
          kind: "LOW_STOCK",
          title: "Butter critically low",
          body: "Only 0.5 kg left (min 1 kg). Consider raising a PO.",
          link: "/inventory",
          outletId: outlet.id,
          createdAt: daysAgo(0, 9, 0),
        },
        {
          kind: "LOW_STOCK",
          title: "Onion below par",
          body: "4 kg in stock; par level is 20 kg.",
          link: "/inventory",
          outletId: outlet.id,
          createdAt: daysAgo(0, 10, 30),
        },
        {
          kind: "ONLINE_ORDER",
          title: "New Swiggy order",
          body: "3 items · ₹720 · Indiranagar",
          link: "/orders/online",
          outletId: outlet.id,
          createdAt: daysAgo(0, 13, 0),
        },
      ],
    });
    console.log(`✓ notifications`);
  }

  // ── 18. Fixed Assets register + a past audit with variance ────────────
  const assetCount = await db.fixedAsset.count({ where: { outletId: outlet.id } });
  if (assetCount === 0) {
    const assets = [
      // Furniture
      { name: "Dining table 4-seater", category: "FURNITURE", location: "Hall A", qty: 8, unitValue: 8500, condition: "GOOD" },
      { name: "Dining table 6-seater", category: "FURNITURE", location: "Hall A", qty: 2, unitValue: 12000, condition: "GOOD" },
      { name: "Dining table 4-seater", category: "FURNITURE", location: "Hall B", qty: 6, unitValue: 8500, condition: "GOOD" },
      { name: "Patio table", category: "FURNITURE", location: "Patio", qty: 3, unitValue: 6500, condition: "FAIR" },
      { name: "Dining chair", category: "FURNITURE", location: "Hall A", qty: 40, unitValue: 1800, condition: "GOOD" },
      { name: "Dining chair", category: "FURNITURE", location: "Hall B", qty: 24, unitValue: 1800, condition: "GOOD" },
      { name: "Patio chair", category: "FURNITURE", location: "Patio", qty: 12, unitValue: 1500, condition: "FAIR" },
      { name: "Lounge sofa 3-seater", category: "FURNITURE", location: "Hall A entrance", qty: 2, unitValue: 32000, condition: "GOOD" },
      { name: "Bar stool", category: "FURNITURE", location: "Bar counter", qty: 6, unitValue: 2400, condition: "GOOD" },
      // Kitchen
      { name: "Tandoor (clay)", category: "KITCHEN", location: "Kitchen", qty: 2, unitValue: 28000, condition: "GOOD" },
      { name: "6-burner gas range", category: "KITCHEN", location: "Kitchen", qty: 1, unitValue: 65000, condition: "GOOD" },
      { name: "Commercial chimney", category: "KITCHEN", location: "Kitchen", qty: 2, unitValue: 22000, condition: "GOOD" },
      { name: "Stainless prep table", category: "KITCHEN", location: "Kitchen", qty: 4, unitValue: 8500, condition: "GOOD" },
      { name: "Deep freezer 500L", category: "KITCHEN", location: "Storeroom", qty: 2, unitValue: 42000, condition: "GOOD" },
      { name: "Double-door fridge", category: "KITCHEN", location: "Kitchen", qty: 1, unitValue: 38000, condition: "GOOD" },
      { name: "Hand blender", category: "KITCHEN", location: "Kitchen", qty: 3, unitValue: 4500, condition: "FAIR" },
      // Electronics
      { name: "Ceiling fan", category: "ELECTRONICS", location: "Hall A", qty: 6, unitValue: 3200, condition: "GOOD" },
      { name: "Ceiling fan", category: "ELECTRONICS", location: "Hall B", qty: 4, unitValue: 3200, condition: "GOOD" },
      { name: "Wall-mount AC 1.5T", category: "ELECTRONICS", location: "Hall A", qty: 2, unitValue: 48000, condition: "GOOD" },
      { name: "Wall-mount AC 1.5T", category: "ELECTRONICS", location: "Hall B", qty: 2, unitValue: 48000, condition: "GOOD" },
      { name: "POS terminal", category: "ELECTRONICS", location: "Cashier", qty: 2, unitValue: 22000, condition: "GOOD" },
      { name: "Thermal printer", category: "ELECTRONICS", location: "Cashier", qty: 2, unitValue: 7500, condition: "GOOD" },
      { name: "KOT printer", category: "ELECTRONICS", location: "Kitchen", qty: 2, unitValue: 7500, condition: "GOOD" },
      { name: "Smart TV 43\"", category: "ELECTRONICS", location: "Hall A", qty: 1, unitValue: 32000, condition: "GOOD" },
      { name: "CCTV camera", category: "ELECTRONICS", location: "All zones", qty: 8, unitValue: 3500, condition: "GOOD" },
      // Decor
      { name: "Framed wall art", category: "DECOR", location: "Hall A", qty: 6, unitValue: 1800, condition: "GOOD" },
      { name: "Pendant lamp", category: "DECOR", location: "Hall A", qty: 8, unitValue: 1200, condition: "GOOD" },
      { name: "Indoor plant", category: "DECOR", location: "Patio + entrance", qty: 10, unitValue: 600, condition: "FAIR" },
      // Other
      { name: "Fire extinguisher", category: "OTHER", location: "Kitchen + halls", qty: 4, unitValue: 2500, condition: "GOOD" },
      { name: "First aid kit", category: "OTHER", location: "Cashier + Kitchen", qty: 2, unitValue: 800, condition: "GOOD" },
    ];
    const created: { id: string; name: string; qty: number }[] = [];
    for (const a of assets) {
      const row = await db.fixedAsset.create({
        data: {
          name: a.name,
          category: a.category,
          location: a.location,
          qty: a.qty,
          unitValue: a.unitValue,
          condition: a.condition,
          active: true,
          outletId: outlet.id,
          purchasedAt: daysAgo(120 + Math.floor(Math.random() * 200)),
        },
      });
      created.push({ id: row.id, name: row.name, qty: row.qty });
    }
    console.log(`✓ ${assets.length} fixed assets`);

    // Past audit — most match, a few have variance (simulates a real audit
    // catching theft / damage / miscounted earlier).
    const auditLines = created.map((a, idx) => {
      // Inject variance on three specific lines so the demo shows variance
      // badges; rest match.
      let foundQty = a.qty;
      if (idx === 4) foundQty = a.qty - 2; // 2 chairs missing
      else if (idx === 14) foundQty = a.qty - 1; // 1 fridge unaccounted
      else if (idx === 27) foundQty = a.qty - 3; // 3 plants damaged/lost
      const variance = foundQty - a.qty;
      return {
        assetId: a.id,
        expectedQty: a.qty,
        foundQty,
        variance,
        conditionAfter: idx === 27 ? "DAMAGED" : null,
        note: variance < 0 ? "Could not locate during audit" : null,
      };
    });
    const varianceLines = auditLines.filter((l) => l.variance !== 0).length;
    await db.assetAudit.create({
      data: {
        outletId: outlet.id,
        auditedById: U_MANAGER,
        auditedAt: daysAgo(7, 11, 0),
        varianceLines,
        notes: "Quarterly audit — conducted with manager + auditor. CCTV being reviewed for missing items.",
        lines: { create: auditLines },
      },
    });
    console.log(`✓ past audit with ${varianceLines} variance lines`);

    // Notification for the variance
    await db.notification.create({
      data: {
        kind: "INFO",
        title: `Last audit flagged ${varianceLines} variance lines`,
        body: "2 chairs, 1 fridge, 3 plants unaccounted. Review CCTV footage.",
        link: "/inventory/assets/audits",
        outletId: outlet.id,
        createdAt: daysAgo(7, 11, 5),
      },
    });
  }

  console.log("─── Demo seed complete ───");
  const counts = await Promise.all([
    db.outlet.count(),
    db.user.count(),
    db.item.count(),
    db.customer.count(),
    db.order.count(),
    db.fixedAsset.count(),
    db.assetAudit.count(),
    db.feedback.count(),
    db.task.count(),
  ]);
  console.log(`Totals — outlets:${counts[0]} users:${counts[1]} items:${counts[2]} customers:${counts[3]} orders:${counts[4]} assets:${counts[5]} audits:${counts[6]} feedback:${counts[7]} tasks:${counts[8]}`);
}

main()
  .catch((e) => {
    console.error("Demo seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
