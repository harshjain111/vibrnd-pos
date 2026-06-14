"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { nextInvoiceNo, nextKotNo, inr } from "@/lib/utils";
import { logActivity } from "@/lib/audit";
import { moveStock, applyRecipeStock } from "@/lib/stock";
import { recordLoyalty, pointsEarned, redeemValue, tierFor, earnMultiplier } from "@/lib/loyalty";
import { requireUser } from "@/lib/rbac";

const AddonShape = z.object({
  name: z.string(),
  priceDelta: z.number(),
});

const CartLine = z.object({
  itemId: z.string(),
  qty: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  variantName: z.string().optional(),
  addons: z.array(AddonShape).default([]),
});

const MembershipClaim = z.object({
  membershipId: z.string(),
  benefitId: z.string(),
  lineKey: z.string(), // matches the cart line that will be priced at 0
});

const PlaceOrderInput = z.object({
  orderType: z.enum(["DINE_IN", "PICKUP", "DELIVERY"]),
  paymentMode: z.enum(["CASH", "CARD", "UPI", "ONLINE", "DUE"]),
  tableId: z.string().optional(),
  customerPhone: z.string().optional(),
  customerName: z.string().optional(),
  customerAllergies: z.string().optional(),
  customerBirthday: z.string().optional(),
  customerAnniversary: z.string().optional(),
  discount: z.number().nonnegative().default(0),
  discountCode: z.string().optional(),
  redeemPoints: z.number().int().nonnegative().default(0),
  tip: z.number().nonnegative().default(0),
  subOrderType: z.string().optional(),
  captainId: z.string().optional(),
  giftCardCode: z.string().optional(),
  giftCardAmount: z.number().nonnegative().default(0),
  membershipClaims: z.array(MembershipClaim).default([]),
  lines: z.array(CartLine.extend({ lineKey: z.string().optional() })).min(1),
  /// Set when the cart was resumed from a held/seeded bill. The action
  /// deletes that source order before creating the new one — keeps the
  /// table's one-bill invariant intact and stops duplicates from piling
  /// up after resume → settle / resume → hold cycles.
  existingOrderId: z.string().optional(),
});

export async function placeOrder(input: z.infer<typeof PlaceOrderInput>) {
  const data = PlaceOrderInput.parse(input);
  const outlet = await getActiveOutlet();

  // CRITICAL state guard: a dine-in table can only have ONE open bill at
  // a time. There are two real-world cases when this branch fires:
  //
  //   1. Receptionist seeded the table — there's a RUNNING order with
  //      zero items on it. We adopt its captainId (from the table
  //      group) and delete the seed so the captain's first bill takes
  //      over cleanly. Without this, every receptionist handoff
  //      doubles into a second running bill on the same table — that
  //      was the duplicate-bills bug on /orders/live.
  //
  //   2. A real bill is already running with items punched. We reject
  //      hard — the captain has to settle / cancel / move the items
  //      before starting a new bill on the same table.
  // Single-bill-per-table invariant — find any other open bill on this
  // dine-in table and decide what to do with it:
  //   • If it IS the bill we're settling (we resumed it from a held
  //     state and now we're closing it out), delete it cleanly so the
  //     new PAID order replaces it 1:1.
  //   • If the only open bill on the table is the receptionist's seed
  //     (0 items), adopt its captainId and delete it.
  //   • If it has items AND it isn't ours, reject — that's a real
  //     concurrent-bill conflict.
  let adoptedCaptainId: string | null = null;
  if (data.orderType === "DINE_IN" && data.tableId) {
    const openOnTable = await db.order.findMany({
      where: {
        outletId: outlet.id,
        tableId: data.tableId,
        status: { in: ["RUNNING", "SAVED", "PRINTED"] },
      },
      include: { _count: { select: { items: true } } },
    });
    for (const open of openOnTable) {
      if (open.id === data.existingOrderId) {
        adoptedCaptainId = adoptedCaptainId ?? open.captainId;
        await db.order.delete({ where: { id: open.id } });
      } else if (open._count.items === 0) {
        adoptedCaptainId = adoptedCaptainId ?? open.captainId;
        await db.order.delete({ where: { id: open.id } });
      } else {
        throw new Error(
          `Table is already running bill ${open.invoiceNo}. Settle or cancel it first, or move the items to a different table.`
        );
      }
    }
  } else if (data.existingOrderId) {
    // Non-dine-in resume: still clean up the source bill so resume →
    // settle doesn't leave a SAVED row floating around.
    const src = await db.order.findUnique({
      where: { id: data.existingOrderId },
      select: { id: true, captainId: true, status: true },
    });
    if (src && !["PAID", "CANCELLED"].includes(src.status)) {
      adoptedCaptainId = src.captainId;
      await db.order.delete({ where: { id: src.id } });
    }
  }

  const items = await db.item.findMany({
    where: { id: { in: data.lines.map((l) => l.itemId) }, outletId: outlet.id },
  });
  const itemMap = new Map(items.map((i) => [i.id, i]));

  let sub = 0;
  let tax = 0;
  for (const l of data.lines) {
    const it = itemMap.get(l.itemId);
    if (!it) throw new Error(`Item ${l.itemId} not found`);
    const lineTotal = l.unitPrice * l.qty;
    const rate = it.taxRate / 100;
    if (outlet.taxInclusive) {
      const base = lineTotal / (1 + rate);
      sub += base;
      tax += lineTotal - base;
    } else {
      sub += lineTotal;
      tax += lineTotal * rate;
    }
  }
  let customerId: string | undefined;
  let customerPoints = 0;
  if (data.customerPhone) {
    const birthday = data.customerBirthday ? new Date(data.customerBirthday) : undefined;
    const anniversary = data.customerAnniversary ? new Date(data.customerAnniversary) : undefined;
    const c = await db.customer.upsert({
      where: { id: `cust-${data.customerPhone}` },
      update: {
        name: data.customerName ?? undefined,
        allergies: data.customerAllergies ?? undefined,
        birthday: birthday ?? undefined,
        anniversary: anniversary ?? undefined,
      },
      create: {
        id: `cust-${data.customerPhone}`,
        name: data.customerName ?? "Walk-in",
        phone: data.customerPhone,
        allergies: data.customerAllergies ?? undefined,
        birthday,
        anniversary,
        outletId: outlet.id,
      },
    });
    customerId = c.id;
    customerPoints = c.loyaltyPoints;
  }

  // Redemption — capped at the customer's actual balance
  const redeemPts = customerId ? Math.min(data.redeemPoints, customerPoints) : 0;
  const redeemDiscount = redeemValue(redeemPts, outlet.loyaltyRedeemRupees);

  // Gift card lookup (if provided)
  let giftCard: { id: string; code: string; balance: number } | null = null;
  if (data.giftCardCode && data.giftCardAmount > 0) {
    const gc = await db.giftCard.findFirst({
      where: { code: data.giftCardCode.toUpperCase().trim(), outletId: outlet.id, active: true },
    });
    if (!gc) throw new Error("Gift card not found");
    if (gc.expiresAt && gc.expiresAt.getTime() < Date.now()) throw new Error("Gift card expired");
    if (gc.balance < data.giftCardAmount) throw new Error("Gift card balance too low");
    giftCard = { id: gc.id, code: gc.code, balance: gc.balance };
  }
  const giftCardPay = giftCard ? Math.min(data.giftCardAmount, giftCard.balance) : 0;
  const totalDiscount = (data.discount || 0) + redeemDiscount;
  const beforeGc = Math.max(0, Math.round(sub + tax - totalDiscount + (data.tip || 0)));
  const grand = Math.max(0, beforeGc - giftCardPay);

  // Earn — based on grand total post-redemption, post-coupon, with tier multiplier
  const tierCfg = {
    silverAt: outlet.tierSilverAt,
    goldAt: outlet.tierGoldAt,
    silverMult: outlet.tierSilverMult,
    goldMult: outlet.tierGoldMult,
  };
  const tier = tierFor(customerPoints, tierCfg);
  const mult = earnMultiplier(tier, tierCfg);
  const earned = customerId ? Math.round(pointsEarned(grand, outlet.loyaltyEarnPer) * mult) : 0;

  // Per-outlet sequence + collision retry — guards against two captains
  // submitting at the same instant (rare but possible) and against legacy
  // pre-namespace invoice numbers that may already occupy a slot.
  let invoiceNo = "";
  {
    const count = await db.order.count({ where: { outletId: outlet.id } });
    for (let attempt = 0; attempt < 5; attempt++) {
      invoiceNo = nextInvoiceNo(count + 1 + attempt, outlet.code);
      const clash = await db.order.findUnique({ where: { invoiceNo } });
      if (!clash) break;
    }
    if (!invoiceNo) throw new Error("Could not allocate an invoice number");
  }

  const order = await db.order.create({
    data: {
      invoiceNo,
      orderType: data.orderType,
      status: data.paymentMode === "DUE" ? "PRINTED" : "PAID",
      channel: "POS",
      subTotal: sub,
      taxTotal: tax,
      discount: totalDiscount,
      discountCode: data.discountCode,
      grandTotal: grand,
      amountPaid: data.paymentMode === "DUE" ? 0 : grand,
      tip: data.tip || 0,
      subOrderType: data.subOrderType,
      // Captain priority: form input → adopted from receptionist seed.
      // Both can be null if no captain was attributed anywhere.
      captainId: data.captainId || adoptedCaptainId || undefined,
      paymentMode: data.paymentMode,
      tableId: data.orderType === "DINE_IN" ? data.tableId : undefined,
      customerId,
      outletId: outlet.id,
      loyaltyEarned: earned,
      loyaltyRedeemed: redeemPts,
      closedAt: data.paymentMode === "DUE" ? null : new Date(),
      items: {
        create: data.lines.map((l) => {
          const it = itemMap.get(l.itemId)!;
          const displayName = l.variantName ? `${it.name} (${l.variantName})` : it.name;
          return {
            itemId: it.id,
            name: displayName,
            price: l.unitPrice,
            qty: l.qty,
            taxRate: it.taxRate,
            variantName: l.variantName,
            addonsJson: l.addons.length ? JSON.stringify(l.addons) : null,
          };
        }),
      },
    },
  });

  // Membership redemption rows — DB unique on (member,benefit,businessDay) enforces daily cap
  if (data.membershipClaims.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const claim of data.membershipClaims) {
      try {
        await db.membershipRedemption.create({
          data: {
            membershipId: claim.membershipId,
            benefitId: claim.benefitId,
            businessDay: today,
            outletId: outlet.id,
            orderId: order.id,
          },
        });
      } catch (e: any) {
        if (e?.code === "P2002") {
          const earlier = await db.membershipRedemption.findFirst({
            where: { membershipId: claim.membershipId, benefitId: claim.benefitId, businessDay: today },
            include: { outlet: true },
          });
          throw new Error(
            `Membership benefit was already redeemed today${earlier?.outlet?.name ? ` at ${earlier.outlet.name}` : ""}. Daily cap is one per benefit across all outlets.`
          );
        }
        throw e;
      }
    }
  }

  // KOTs — one ticket per kitchen station
  const linesByStation = new Map<string, typeof data.lines>();
  for (const l of data.lines) {
    const it = itemMap.get(l.itemId)!;
    const station = it.station || "MAIN";
    const arr = linesByStation.get(station) ?? [];
    arr.push(l);
    linesByStation.set(station, arr);
  }
  let kotCount = await db.kitchenTicket.count({ where: { outletId: outlet.id } });
  for (const [station, ls] of linesByStation) {
    kotCount += 1;
    const kotNo = `KOT-${String(kotCount).padStart(6, "0")}`;
    await db.kitchenTicket.create({
      data: {
        kotNo,
        orderId: order.id,
        outletId: outlet.id,
        station,
        status: "NEW",
        lines: {
          create: ls.map((l) => {
            const it = itemMap.get(l.itemId)!;
            const note = [
              l.variantName ? l.variantName : null,
              ...l.addons.map((a) => `+ ${a.name}`),
            ]
              .filter(Boolean)
              .join(" · ");
            return { itemId: it.id, name: it.name, qty: l.qty, note: note || undefined };
          }),
        },
      },
    });
  }

  // Stock auto-consumption — variant + addon aware via applyRecipeStock.
  for (const l of data.lines) {
    await applyRecipeStock({
      itemId: l.itemId,
      variantName: l.variantName ?? null,
      qty: l.qty,
      addons: l.addons ?? [],
      refId: order.id,
      refType: "Order",
      note: `${invoiceNo} · ${itemMap.get(l.itemId)?.name ?? "item"}${l.variantName ? ` (${l.variantName})` : ""} ×${l.qty}`,
    });
  }

  // Loyalty bookkeeping
  if (customerId) {
    if (redeemPts > 0) {
      await recordLoyalty({
        customerId,
        outletId: outlet.id,
        delta: -redeemPts,
        reason: "REDEEM",
        orderId: order.id,
        note: `Redeemed ${redeemPts} pts (₹${redeemDiscount}) on ${invoiceNo}`,
      });
    }
    if (earned > 0) {
      await recordLoyalty({
        customerId,
        outletId: outlet.id,
        delta: earned,
        reason: "EARN",
        orderId: order.id,
        note: `Earned on ${invoiceNo}`,
      });
    }
  }

  // Debit gift card balance if used
  if (giftCard && giftCardPay > 0) {
    await db.giftCard.update({
      where: { id: giftCard.id },
      data: {
        balance: { decrement: giftCardPay },
        txns: { create: { kind: "REDEEM", amount: -giftCardPay, orderId: order.id, actor: "system" } },
      },
    });
  }

  // Record the receipt as a Payment row for non-DUE settlements
  if (data.paymentMode !== "DUE") {
    await db.payment.create({
      data: {
        orderId: order.id,
        outletId: outlet.id,
        amount: grand,
        mode: data.paymentMode,
        actor: "system",
      },
    });
  }

  await logActivity({
    action: "SETTLE",
    entity: "Order",
    entityId: order.id,
    summary: `Settled ${invoiceNo} for ${inr(grand)} via ${data.paymentMode}${data.discountCode ? ` (coupon ${data.discountCode})` : ""}${redeemPts > 0 ? ` · redeemed ${redeemPts} pts` : ""}${earned > 0 ? ` · earned ${earned} pts` : ""}${giftCard ? ` · gift card ${giftCard.code} −${inr(giftCardPay)}` : ""}`,
    outletId: outlet.id,
  });

  revalidatePath("/");
  revalidatePath("/orders");
  revalidatePath("/orders/live");
  revalidatePath("/orders/kot");
  revalidatePath("/kds");
  redirect(`/billing/receipt/${order.id}`);
}

export async function lookupCustomerByPhone(phone: string) {
  if (!phone || phone.length < 4) return null;
  const c = await db.customer.findFirst({
    where: { id: `cust-${phone}` },
  });
  if (!c) return null;
  const outlet = await getActiveOutlet();
  const cfg = {
    silverAt: outlet.tierSilverAt,
    goldAt: outlet.tierGoldAt,
    silverMult: outlet.tierSilverMult,
    goldMult: outlet.tierGoldMult,
  };
  const tier = tierFor(c.loyaltyPoints, cfg);
  const mult = earnMultiplier(tier, cfg);
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    allergies: c.allergies,
    birthday: c.birthday ? c.birthday.toISOString() : null,
    anniversary: c.anniversary ? c.anniversary.toISOString() : null,
    loyaltyPoints: c.loyaltyPoints,
    tier,
    earnMultiplier: mult,
  };
}

/**
 * Build a smart captain-facing profile from the customer's order history:
 * favourite item / drink / starter, average ticket size, last visit, etc.
 * Categories with names containing "drink"/"beverage"/"juice" are treated as drinks;
 * "starter"/"appetizer" as starters; otherwise tracked as plain favourites.
 */
export async function getCustomerInsights(phone: string) {
  if (!phone || phone.length < 4) return null;
  const c = await db.customer.findFirst({ where: { id: `cust-${phone}` } });
  if (!c) return null;
  const orders = await db.order.findMany({
    where: { customerId: c.id, status: { in: ["PAID", "PRINTED", "DELIVERED", "PICKED_UP"] } },
    include: { items: { include: { item: { include: { category: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  if (orders.length === 0) {
    return {
      name: c.name,
      phone: c.phone,
      allergies: c.allergies ?? null,
      birthday: c.birthday ? c.birthday.toISOString() : null,
      anniversary: c.anniversary ? c.anniversary.toISOString() : null,
      visits: 0,
      avgTicket: 0,
      lastVisit: null,
      favourites: { overall: null, drink: null, starter: null },
      tags: [] as string[],
    };
  }
  const totalSpend = orders.reduce((s, o) => s + o.grandTotal, 0);
  const avgTicket = Math.round(totalSpend / orders.length);
  const lastVisit = orders[0].createdAt.toISOString();

  const bucketKind = (catName: string): "drink" | "starter" | "other" => {
    const n = catName.toLowerCase();
    if (/drink|beverage|juice|tea|coffee|shake|mocktail|cocktail/.test(n)) return "drink";
    if (/starter|appetizer|appetiser|snack/.test(n)) return "starter";
    return "other";
  };

  const tally = new Map<string, { name: string; qty: number; kind: "drink" | "starter" | "other" }>();
  for (const o of orders) {
    for (const li of o.items) {
      const name = li.item?.name ?? li.name;
      const kind = li.item?.category ? bucketKind(li.item.category.name) : "other";
      const prev = tally.get(name) ?? { name, qty: 0, kind };
      prev.qty += li.qty;
      tally.set(name, prev);
    }
  }
  const ranked = [...tally.values()].sort((a, b) => b.qty - a.qty);
  const top = (kind: "drink" | "starter" | "other") =>
    ranked.find((r) => r.kind === kind) ?? null;

  return {
    name: c.name,
    phone: c.phone,
    allergies: c.allergies ?? null,
    birthday: c.birthday ? c.birthday.toISOString() : null,
    anniversary: c.anniversary ? c.anniversary.toISOString() : null,
    visits: orders.length,
    avgTicket,
    lastVisit,
    favourites: {
      overall: ranked[0] ? { name: ranked[0].name, qty: ranked[0].qty } : null,
      drink: top("drink") ? { name: top("drink")!.name, qty: top("drink")!.qty } : null,
      starter: top("starter") ? { name: top("starter")!.name, qty: top("starter")!.qty } : null,
    },
    tags: c.tags ? c.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
  };
}

/**
 * Returns active memberships for the customer + benefit list (with item ids so the
 * billing screen can match against cart lines and show a Redeem button per line).
 */
export async function getBillMemberships(phone: string) {
  if (!phone || phone.length < 4) return [];
  const c = await db.customer.findFirst({ where: { id: `cust-${phone}` } });
  if (!c) return [];
  const now = new Date();
  const memberships = await db.membership.findMany({
    where: { customerId: c.id, active: true, expiresAt: { gt: now } },
    include: { plan: { include: { benefits: { include: { item: true } } } } },
  });
  return memberships.map((m) => ({
    membershipId: m.id,
    planName: m.plan.name,
    expiresAt: m.expiresAt.toISOString(),
    benefits: m.plan.benefits.map((b) => ({
      id: b.id,
      name: b.name,
      itemId: b.itemId,
      itemName: b.item?.name ?? null,
      qtyPerDay: b.qtyPerDay,
    })),
  }));
}

/**
 * Resume a held bill — return its full state for the BillingScreen to rehydrate.
 * Used by /billing?resume=ID. Includes items, customer, table, KOT state.
 */
export async function resumeHeldBill(orderId: string) {
  const outlet = await getActiveOutlet();
  const o = await db.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { item: true } },
      customer: true,
      table: true,
      kots: { select: { id: true, kotNo: true, status: true, printedCount: true, reprintCount: true } },
    },
  });
  if (!o || o.outletId !== outlet.id) throw new Error("Bill not found");
  if (o.status === "PAID" || o.status === "CANCELLED") {
    throw new Error(`This bill is already ${o.status.toLowerCase()}.`);
  }
  return {
    id: o.id,
    invoiceNo: o.invoiceNo,
    orderType: o.orderType as "DINE_IN" | "PICKUP" | "DELIVERY",
    subOrderType: o.subOrderType,
    tableId: o.tableId,
    captainId: o.captainId,
    customerPhone: o.customer?.phone ?? "",
    customerName: o.customer?.name ?? "",
    allergies: o.customer?.allergies ?? "",
    birthday: o.customer?.birthday ? o.customer.birthday.toISOString().slice(0, 10) : "",
    anniversary: o.customer?.anniversary ? o.customer.anniversary.toISOString().slice(0, 10) : "",
    items: o.items.map((li) => ({
      orderItemId: li.id,
      itemId: li.itemId,
      itemName: li.item?.name ?? li.name,
      qty: li.qty,
      price: li.price,
      taxRate: li.taxRate,
      variantName: li.variantName,
      addonsJson: li.addonsJson,
    })),
    kots: o.kots.map((k) => ({
      id: k.id,
      kotNo: k.kotNo,
      status: k.status,
      printedCount: k.printedCount,
      reprintCount: k.reprintCount,
    })),
    notes: o.notes,
  };
}

/**
 * Settle a held bill — update existing Order to PAID instead of creating new.
 * Used when /billing was launched via ?resume=ID and the captain pressed Settle.
 */
const SettleHeldInput = z.object({
  orderId: z.string(),
  paymentMode: z.enum(["CASH", "CARD", "UPI", "ONLINE", "DUE"]),
  discount: z.number().nonnegative().default(0),
  discountCode: z.string().optional(),
  redeemPoints: z.number().int().nonnegative().default(0),
  tip: z.number().nonnegative().default(0),
});
export async function settleHeldBill(input: z.infer<typeof SettleHeldInput>) {
  const data = SettleHeldInput.parse(input);
  const outlet = await getActiveOutlet();
  const o = await db.order.findUnique({ where: { id: data.orderId }, include: { items: true } });
  if (!o || o.outletId !== outlet.id) throw new Error("Order not found");
  if (o.status === "PAID" || o.status === "CANCELLED") throw new Error(`Already ${o.status.toLowerCase()}.`);

  let sub = 0;
  let tax = 0;
  for (const l of o.items) {
    const lineTotal = l.price * l.qty;
    sub += lineTotal;
    tax += lineTotal * (l.taxRate / 100);
  }
  const grand = Math.max(0, Math.round(sub + tax - (data.discount || 0) + (data.tip || 0)));
  await db.order.update({
    where: { id: o.id },
    data: {
      status: data.paymentMode === "DUE" ? "PRINTED" : "PAID",
      subTotal: sub,
      taxTotal: tax,
      discount: data.discount,
      discountCode: data.discountCode,
      grandTotal: grand,
      amountPaid: data.paymentMode === "DUE" ? 0 : grand,
      tip: data.tip || 0,
      paymentMode: data.paymentMode,
      closedAt: data.paymentMode === "DUE" ? null : new Date(),
    },
  });
  if (data.paymentMode !== "DUE") {
    await db.payment.create({
      data: {
        orderId: o.id,
        outletId: outlet.id,
        amount: grand,
        mode: data.paymentMode,
        actor: "system",
      },
    });
  }
  await logActivity({
    action: "SETTLE",
    entity: "Order",
    entityId: o.id,
    summary: `Resumed + settled ${o.invoiceNo} for ${inr(grand)} via ${data.paymentMode}`,
    outletId: outlet.id,
  });
  revalidatePath("/orders");
  revalidatePath("/orders/live");
  revalidatePath("/kds");
  redirect(`/billing/receipt/${o.id}`);
}

/**
 * Append new line items to a held bill and generate the next KOT round.
 *
 * Use this when the captain has already sent KOT #1 and the customer now wants
 * to add more items. We append the new lines to the existing Order, create a
 * NEW KitchenTicket (e.g. KOT-000023-R2), and bump totals. The original KOT
 * row's printedCount/reprintCount stays untouched — each round is its own
 * audit-trail entry.
 */
const RoundKotInput = z.object({
  orderId: z.string(),
  lines: z.array(CartLine).min(1),
});
export async function addRoundKot(input: z.infer<typeof RoundKotInput>) {
  await requireUser("BILLER");
  const outlet = await getActiveOutlet();
  const data = RoundKotInput.parse(input);
  const order = await db.order.findUnique({
    where: { id: data.orderId },
    include: { items: true, kots: true },
  });
  if (!order || order.outletId !== outlet.id) throw new Error("Order not found");
  if (order.status === "PAID" || order.status === "CANCELLED") {
    throw new Error(`Cannot add to a ${order.status.toLowerCase()} bill.`);
  }

  // Load item rows to capture name / station / taxRate for the new lines.
  const items = await db.item.findMany({
    where: { id: { in: data.lines.map((l) => l.itemId) }, outletId: outlet.id },
  });
  const itemMap = new Map(items.map((i) => [i.id, i]));

  // 1. Append the new OrderItems.
  let addSub = 0;
  let addTax = 0;
  for (const l of data.lines) {
    const it = itemMap.get(l.itemId);
    if (!it) continue;
    const displayName = l.variantName ? `${it.name} (${l.variantName})` : it.name;
    const lineTotal = l.unitPrice * l.qty;
    const rate = it.taxRate / 100;
    if (outlet.taxInclusive) {
      const base = lineTotal / (1 + rate);
      addSub += base;
      addTax += lineTotal - base;
    } else {
      addSub += lineTotal;
      addTax += lineTotal * rate;
    }
    await db.orderItem.create({
      data: {
        orderId: order.id,
        itemId: it.id,
        name: displayName,
        price: l.unitPrice,
        qty: l.qty,
        taxRate: it.taxRate,
        variantName: l.variantName,
        addonsJson: l.addons.length ? JSON.stringify(l.addons) : null,
      },
    });
  }
  // Bump order totals.
  await db.order.update({
    where: { id: order.id },
    data: {
      subTotal: { increment: addSub },
      taxTotal: { increment: addTax },
      grandTotal: { increment: Math.round(addSub + addTax) },
    },
  });

  // 2. Create a fresh KitchenTicket — one per round — grouped by station.
  // Round number = current kot count for this order + 1.
  const roundIndex = order.kots.length + 1;
  const linesByStation = new Map<string, typeof data.lines>();
  for (const l of data.lines) {
    const it = itemMap.get(l.itemId);
    if (!it) continue;
    const station = it.station || "MAIN";
    const arr = linesByStation.get(station) ?? [];
    arr.push(l);
    linesByStation.set(station, arr);
  }
  const kotsCreated: { kotNo: string; station: string }[] = [];
  for (const [station, ls] of linesByStation) {
    let kotCount = await db.kitchenTicket.count({ where: { outletId: outlet.id } });
    let kotNo = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      kotNo = nextKotNo(kotCount + 1 + attempt, outlet.code, `R${roundIndex}`);
      const clash = await db.kitchenTicket.findUnique({ where: { kotNo } });
      if (!clash) break;
    }
    if (!kotNo) throw new Error("Could not allocate a KOT number");
    const k = await db.kitchenTicket.create({
      data: {
        kotNo,
        orderId: order.id,
        outletId: outlet.id,
        station,
        status: "NEW",
        printedCount: 1,
        lines: {
          create: ls.map((l) => {
            const it = itemMap.get(l.itemId)!;
            const note = [
              l.variantName ? l.variantName : null,
              ...l.addons.map((a) => `+ ${a.name}`),
            ]
              .filter(Boolean)
              .join(" · ");
            return { itemId: it.id, name: it.name, qty: l.qty, note: note || undefined };
          }),
        },
      },
    });
    kotsCreated.push({ kotNo: k.kotNo, station });
  }

  await logActivity({
    action: "CREATE",
    entity: "KOT",
    entityId: order.id,
    summary: `Round ${roundIndex} KOT(s) sent for ${order.invoiceNo} — ${kotsCreated.length} new line(s)`,
    outletId: outlet.id,
  });

  revalidatePath("/kds");
  revalidatePath("/orders/live");
  revalidatePath(`/orders/${order.id}`);
  return { roundIndex, kots: kotsCreated };
}

/**
 * Send the first KOT for a held bill. Idempotent — server records
 * printedCount; the client uses this to lock the Send KOT button after first
 * press. Reprints go through `reprintKot` (with a mandatory reason).
 */
export async function sendKotForOrder(orderId: string) {
  await requireUser("BILLER");
  const outlet = await getActiveOutlet();
  const o = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, kots: true },
  });
  if (!o || o.outletId !== outlet.id) throw new Error("Order not found");
  if (o.kots.some((k) => k.printedCount > 0)) {
    return { alreadySent: true as const, kotNo: o.kots[0].kotNo };
  }
  // The KOT row already exists from holdOrder; just bump its printedCount and timestamp.
  if (o.kots[0]) {
    await db.kitchenTicket.update({
      where: { id: o.kots[0].id },
      data: { printedCount: { increment: 1 }, status: "NEW" },
    });
    await logActivity({
      action: "CREATE",
      entity: "KOT",
      entityId: o.kots[0].id,
      summary: `Sent KOT ${o.kots[0].kotNo} for ${o.invoiceNo}`,
      outletId: outlet.id,
    });
    revalidatePath("/kds");
    return { alreadySent: false as const, kotNo: o.kots[0].kotNo };
  }
  // Fallback — order exists but no KOT row yet. Create one.
  let kotCount = await db.kitchenTicket.count({ where: { outletId: outlet.id } });
  let kotNo = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    kotNo = nextKotNo(kotCount + 1 + attempt, outlet.code);
    const clash = await db.kitchenTicket.findUnique({ where: { kotNo } });
    if (!clash) break;
  }
  if (!kotNo) throw new Error("Could not allocate a KOT number");
  const k = await db.kitchenTicket.create({
    data: {
      kotNo,
      orderId: o.id,
      outletId: outlet.id,
      station: "MAIN",
      status: "NEW",
      printedCount: 1,
      lines: {
        create: o.items.map((li) => ({
          itemId: li.itemId,
          name: li.name,
          qty: li.qty,
          note: li.variantName ?? undefined,
        })),
      },
    },
  });
  revalidatePath("/kds");
  return { alreadySent: false as const, kotNo: k.kotNo };
}

/**
 * Reprint an already-sent KOT. Mandatory reason — captured to audit and
 * bumps the reprintCount counter.
 */
export async function reprintKot(orderId: string, reason: string) {
  await requireUser("BILLER");
  if (!reason || reason.trim().length < 3) throw new Error("Reason required (min 3 chars).");
  const outlet = await getActiveOutlet();
  const o = await db.order.findUnique({
    where: { id: orderId },
    include: { kots: true },
  });
  if (!o || o.outletId !== outlet.id) throw new Error("Order not found");
  const kot = o.kots[0];
  if (!kot) throw new Error("No KOT to reprint.");
  await db.kitchenTicket.update({
    where: { id: kot.id },
    data: {
      reprintCount: { increment: 1 },
      reprintReason: reason.trim(),
    },
  });
  await logActivity({
    action: "UPDATE",
    entity: "KOT",
    entityId: kot.id,
    summary: `Re-printed KOT ${kot.kotNo} for ${o.invoiceNo} — reason: ${reason}`,
    outletId: outlet.id,
  });
  revalidatePath("/kds");
  return { kotNo: kot.kotNo, reprintCount: kot.reprintCount + 1 };
}

/**
 * List held bills (status SAVED/PRINTED) for the recall picker on POS Customer
 * step. Returns lightweight rows the captain can scan and pick from.
 */
export async function listHeldBills() {
  const outlet = await getActiveOutlet();
  const rows = await db.order.findMany({
    where: { outletId: outlet.id, status: { in: ["SAVED", "PRINTED"] } },
    include: { customer: true, table: true, items: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return rows.map((o) => ({
    id: o.id,
    invoiceNo: o.invoiceNo,
    orderType: o.orderType,
    status: o.status,
    customerName: o.customer?.name ?? null,
    customerPhone: o.customer?.phone ?? null,
    tableName: o.table?.name ?? null,
    lineCount: o.items.length,
    grandTotal: o.grandTotal,
    createdAt: o.createdAt.toISOString(),
  }));
}

/** Generates a 6-digit OTP for a membership, 5-minute validity. Returns the code so the demo UI can display it. */
export async function sendBillOtp(membershipId: string) {
  if (!membershipId) return { error: "Membership required" } as const;
  const m = await db.membership.findUnique({
    where: { id: membershipId },
    include: { customer: true },
  });
  if (!m) return { error: "Membership not found" } as const;
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  await db.membershipOtp.create({ data: { membershipId, code, expiresAt } });
  return { ok: true as const, code, phone: m.customer.phone ?? "" };
}

/**
 * Best-matching auto-discount for the current cart subtotal (audit TASK 12).
 * Returns `null` if no auto-discount qualifies. Client uses this to show a
 * "Auto-applied" chip on the Settle step before settle is pressed.
 */
export async function getAutoDiscount(subtotal: number) {
  const outlet = await getActiveOutlet();
  const { pickAutoDiscount } = await import("@/lib/auto-discount");
  return pickAutoDiscount({ outletId: outlet.id, subtotal });
}

/** Verifies an OTP. Marks it used. Does NOT create a redemption row — that happens at placeOrder. */
export async function verifyBillOtp(membershipId: string, code: string) {
  if (!code || code.length !== 6) return { error: "Invalid code" } as const;
  const otp = await db.membershipOtp.findFirst({
    where: { membershipId, code, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return { error: "Code expired or wrong. Try again." } as const;
  await db.membershipOtp.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
  return { ok: true as const };
}

const HoldInput = PlaceOrderInput.omit({ paymentMode: true });

export async function holdOrder(input: z.infer<typeof HoldInput>): Promise<{ id: string; invoiceNo: string }> {
  const data = HoldInput.parse(input);
  const outlet = await getActiveOutlet();

  // Same adopt-or-reject guard as placeOrder. existingOrderId lets a
  // resume → hold cycle (cart was opened from a held bill, captain
  // added more items, clicks Hold again) replace the source instead of
  // duplicating it.
  let adoptedCaptainId: string | null = null;
  if (data.orderType === "DINE_IN" && data.tableId) {
    const openOnTable = await db.order.findMany({
      where: {
        outletId: outlet.id,
        tableId: data.tableId,
        status: { in: ["RUNNING", "SAVED", "PRINTED"] },
      },
      include: { _count: { select: { items: true } } },
    });
    for (const open of openOnTable) {
      if (open.id === data.existingOrderId) {
        adoptedCaptainId = adoptedCaptainId ?? open.captainId;
        await db.order.delete({ where: { id: open.id } });
      } else if (open._count.items === 0) {
        adoptedCaptainId = adoptedCaptainId ?? open.captainId;
        await db.order.delete({ where: { id: open.id } });
      } else {
        throw new Error(
          `Table is already running bill ${open.invoiceNo}. Settle / cancel / move it first.`
        );
      }
    }
  } else if (data.existingOrderId) {
    const src = await db.order.findUnique({
      where: { id: data.existingOrderId },
      select: { id: true, captainId: true, status: true },
    });
    if (src && !["PAID", "CANCELLED"].includes(src.status)) {
      adoptedCaptainId = src.captainId;
      await db.order.delete({ where: { id: src.id } });
    }
  }

  const items = await db.item.findMany({
    where: { id: { in: data.lines.map((l) => l.itemId) }, outletId: outlet.id },
  });
  const itemMap = new Map(items.map((i) => [i.id, i]));

  let sub = 0;
  let tax = 0;
  for (const l of data.lines) {
    const it = itemMap.get(l.itemId);
    if (!it) throw new Error(`Item ${l.itemId} not found`);
    const lineTotal = l.unitPrice * l.qty;
    const rate = it.taxRate / 100;
    if (outlet.taxInclusive) {
      const base = lineTotal / (1 + rate);
      sub += base;
      tax += lineTotal - base;
    } else {
      sub += lineTotal;
      tax += lineTotal * rate;
    }
  }
  const grand = Math.round(sub + tax - (data.discount || 0) + (data.tip || 0));

  let customerId: string | undefined;
  if (data.customerPhone) {
    const birthday = data.customerBirthday ? new Date(data.customerBirthday) : undefined;
    const anniversary = data.customerAnniversary ? new Date(data.customerAnniversary) : undefined;
    const c = await db.customer.upsert({
      where: { id: `cust-${data.customerPhone}` },
      update: {
        name: data.customerName ?? undefined,
        allergies: data.customerAllergies ?? undefined,
        birthday: birthday ?? undefined,
        anniversary: anniversary ?? undefined,
      },
      create: {
        id: `cust-${data.customerPhone}`,
        name: data.customerName ?? "Walk-in",
        phone: data.customerPhone,
        allergies: data.customerAllergies ?? undefined,
        birthday,
        anniversary,
        outletId: outlet.id,
      },
    });
    customerId = c.id;
  }

  // Generate a per-outlet sequence; loop on the unlikely race collision so
  // two captains hitting Send KOT simultaneously don't both fail.
  let invoiceNo = "";
  let count = await db.order.count({ where: { outletId: outlet.id } });
  for (let attempt = 0; attempt < 5; attempt++) {
    invoiceNo = nextInvoiceNo(count + 1 + attempt, outlet.code);
    const clash = await db.order.findUnique({ where: { invoiceNo } });
    if (!clash) break;
  }
  if (!invoiceNo) throw new Error("Could not allocate an invoice number");

  const order = await db.order.create({
    data: {
      invoiceNo,
      orderType: data.orderType,
      status: "SAVED",
      channel: "POS",
      subTotal: sub,
      taxTotal: tax,
      discount: data.discount,
      discountCode: data.discountCode,
      grandTotal: grand,
      tip: data.tip || 0,
      subOrderType: data.subOrderType,
      captainId: data.captainId || adoptedCaptainId || undefined,
      tableId: data.orderType === "DINE_IN" ? data.tableId : undefined,
      customerId,
      outletId: outlet.id,
      items: {
        create: data.lines.map((l) => {
          const it = itemMap.get(l.itemId)!;
          const displayName = l.variantName ? `${it.name} (${l.variantName})` : it.name;
          return {
            itemId: it.id,
            name: displayName,
            price: l.unitPrice,
            qty: l.qty,
            taxRate: it.taxRate,
            variantName: l.variantName,
            addonsJson: l.addons.length ? JSON.stringify(l.addons) : null,
          };
        }),
      },
    },
  });

  // KOTs by station — held orders still go to kitchen
  const linesByStation = new Map<string, typeof data.lines>();
  for (const l of data.lines) {
    const it = itemMap.get(l.itemId)!;
    const st = it.station || "MAIN";
    const arr = linesByStation.get(st) ?? [];
    arr.push(l);
    linesByStation.set(st, arr);
  }
  let kotCount = await db.kitchenTicket.count({ where: { outletId: outlet.id } });
  for (const [station, ls] of linesByStation) {
    kotCount += 1;
    // Loop on the rare clash with a legacy `KOT-000123` row from before
    // outlet-scoped numbering landed.
    let kotNo = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      kotNo = nextKotNo(kotCount + attempt, outlet.code);
      const clash = await db.kitchenTicket.findUnique({ where: { kotNo } });
      if (!clash) break;
    }
    if (!kotNo) throw new Error("Could not allocate a KOT number");
    await db.kitchenTicket.create({
      data: {
        kotNo,
        orderId: order.id,
        outletId: outlet.id,
        station,
        status: "NEW",
        lines: {
          create: ls.map((l) => {
            const it = itemMap.get(l.itemId)!;
            const note = [l.variantName, ...l.addons.map((a) => `+ ${a.name}`)].filter(Boolean).join(" · ");
            return { itemId: it.id, name: it.name, qty: l.qty, note: note || undefined };
          }),
        },
      },
    });
  }

  await logActivity({
    action: "CREATE",
    entity: "Order",
    entityId: order.id,
    summary: `Held ${invoiceNo} for ${inr(grand)} — awaiting settlement`,
    outletId: outlet.id,
  });

  revalidatePath("/orders");
  revalidatePath("/orders/live");
  revalidatePath("/kds");
  revalidatePath("/logs");
  return { id: order.id, invoiceNo };
}
