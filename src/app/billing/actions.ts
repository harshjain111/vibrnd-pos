"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { nextInvoiceNo, inr } from "@/lib/utils";
import { logActivity } from "@/lib/audit";
import { moveStock } from "@/lib/stock";
import { recordLoyalty, pointsEarned, redeemValue, tierFor, earnMultiplier } from "@/lib/loyalty";

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
});

export async function placeOrder(input: z.infer<typeof PlaceOrderInput>) {
  const data = PlaceOrderInput.parse(input);
  const outlet = await getActiveOutlet();

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

  const count = await db.order.count({ where: { outletId: outlet.id } });
  const invoiceNo = nextInvoiceNo(count + 1);

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
      captainId: data.captainId,
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

  // Stock auto-consumption (best-effort) — every move is logged
  for (const l of data.lines) {
    const recipe = await db.recipe.findUnique({
      where: { itemId: l.itemId },
      include: { ingredients: true },
    });
    if (!recipe) continue;
    for (const ing of recipe.ingredients) {
      await moveStock({
        rawMaterialId: ing.rawMaterialId,
        delta: -(ing.qty * l.qty),
        reason: "SALE",
        refType: "Order",
        refId: order.id,
        note: `${invoiceNo} · ${itemMap.get(l.itemId)?.name ?? "item"} ×${l.qty}`,
      });
    }
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

  const count = await db.order.count({ where: { outletId: outlet.id } });
  const invoiceNo = nextInvoiceNo(count + 1);

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
      captainId: data.captainId,
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
    await db.kitchenTicket.create({
      data: {
        kotNo: `KOT-${String(kotCount).padStart(6, "0")}`,
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
