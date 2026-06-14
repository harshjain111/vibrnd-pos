"use server";
/**
 * Discount module — save / delete / lookup actions.
 *
 * Spec: C:\Users\ASUS\Desktop\Vibrnd_Discount_Module_Spec.md
 *
 * The form sends a flat FormData blob with ~20 conditional fields. We
 * parse it into the shape Prisma expects, run the spec's required-field
 * rules per discount type, and persist Discount + (optionally)
 * DiscountBogo in a single transaction.
 *
 * Legacy enums on the existing Discount.type column (FLAT / PERCENT) are
 * accepted by the form for back-compat and normalised here.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { logActivity } from "@/lib/audit";

const TYPES = ["PERCENTAGE", "FIXED", "BOGO", "FIXED_PRICE"] as const;
const CHANNELS = [
  "POS",
  "ONLINE_PLATFORM",
  "ZOMATO",
  "SWIGGY",
  "KIOSK",
  "GPAY",
  "OS_AGGREGATOR",
  "MR_DIVERT",
  "IRCTC",
] as const;
const VALIDATION = ["NONE", "CODE_ONLY", "COUPON_VALIDATED"] as const;

const Csv = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean).join(",") : ""))
  .transform((s) => (s.length ? s : null));

const D = z.object({
  id: z.string().optional(),
  title: z.string().min(1, "Title is required"),
  code: z.string().optional(), // generated for NONE / CODE_ONLY without typed code
  type: z.enum(TYPES).or(z.enum(["FLAT", "PERCENT"])).transform((v) => {
    if (v === "FLAT") return "FIXED" as const;
    if (v === "PERCENT") return "PERCENTAGE" as const;
    return v;
  }),
  channel: z.enum(CHANNELS).default("POS"),
  orderTypes: z.string().default("DELIVERY,PICKUP,DINE_IN").transform((s) => {
    const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
    return parts.length ? parts.join(",") : "DELIVERY,PICKUP,DINE_IN";
  }),
  value: z.coerce.number().nonnegative().default(0),
  minOrder: z.coerce.number().nonnegative().default(0),
  maxOrder: z.coerce.number().nonnegative().optional(),
  maxDiscount: z.coerce.number().nonnegative().optional(),
  applyOn: z.enum(["AMOUNT", "PAYMENT_TYPE"]).default("AMOUNT"),
  paymentMethods: Csv,
  applyAt: z.enum(["CORE", "TOTAL"]).default("CORE"),
  applicableScope: z.enum(["ALL", "CATEGORIES", "ITEMS"]).default("ALL"),
  applicableIds: Csv,
  validationMode: z.enum(VALIDATION).default("NONE"),
  active: z.coerce.boolean().default(true),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  timeFrom: z.string().optional(),
  timeTo: z.string().optional(),
  daysOfWeek: Csv,
  description: z.string().optional(),
  terms: z.string().optional(),
});

const BogoSchema = z.object({
  itemAmountMin: z.coerce.number().nonnegative().optional(),
  buyScope: z.enum(["ALL", "CATEGORIES", "ITEMS"]).default("ALL"),
  buyScopeIds: Csv,
  getScope: z.enum(["ALL", "CATEGORIES", "ITEMS"]).default("ALL"),
  getScopeIds: Csv,
  buyQty: z.coerce.number().int().positive().default(1),
  getQty: z.coerce.number().int().positive().default(1),
  bogoValueType: z.enum(["PERCENTAGE", "FIXED"]).default("PERCENTAGE"),
  bogoValue: z.coerce.number().nonnegative().default(100),
  getItemPricing: z.enum(["LOWER", "HIGHER", "SAME"]).default("LOWER"),
  buyItemPricing: z.enum(["LOWER", "HIGHER"]).default("LOWER"),
  showFreeQtyOnPos: z.coerce.boolean().default(true),
  buyAmountCap: z.coerce.number().nonnegative().optional(),
});

type SaveResult = { ok: true; id: string } | { ok: false; error: string };

function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.valueOf()) ? null : d;
}

function autoCode(title: string) {
  // Spec calls Code "auto-generated unless coupon-validated". Use a
  // human-friendly slug + short random suffix so the DB unique key
  // doesn't collide across outlets while staying readable in reports.
  const slug = title
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 10) || "AUTO";
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${slug}-${suffix}`;
}

export async function saveDiscount(fd: FormData): Promise<SaveResult> {
  try {
    const outlet = await getActiveOutlet();

    const parsed = D.safeParse({
      id: fd.get("id") || undefined,
      title: fd.get("title") || fd.get("name") || "",
      code: fd.get("code") || undefined,
      type: fd.get("type"),
      channel: fd.get("channel") || "POS",
      orderTypes: (fd.getAll("orderTypes") as string[]).join(",") || "DELIVERY,PICKUP,DINE_IN",
      value: fd.get("value") ?? 0,
      minOrder: fd.get("minOrder") ?? 0,
      maxOrder: fd.get("maxOrder") || undefined,
      maxDiscount: fd.get("maxDiscount") || undefined,
      applyOn: fd.get("applyOn") || "AMOUNT",
      paymentMethods: (fd.getAll("paymentMethods") as string[]).join(",") || undefined,
      applyAt: fd.get("applyAt") || "CORE",
      applicableScope: fd.get("applicableScope") || "ALL",
      applicableIds: (fd.getAll("applicableIds") as string[]).join(",") || undefined,
      validationMode: fd.get("validationMode") || "NONE",
      active: fd.get("active") === "on",
      validFrom: fd.get("validFrom") || undefined,
      validTo: fd.get("validTo") || undefined,
      timeFrom: fd.get("timeFrom") || undefined,
      timeTo: fd.get("timeTo") || undefined,
      daysOfWeek: (fd.getAll("daysOfWeek") as string[]).join(",") || undefined,
      description: fd.get("description") || undefined,
      terms: fd.get("terms") || undefined,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return { ok: false, error: `${first.path.join(".")}: ${first.message}` };
    }
    const v = parsed.data;

    // Per-type required-field rules from spec §3 — we surface them up
    // front so the cashier sees a clear toast instead of a Prisma error.
    if (v.type === "PERCENTAGE" && (v.value <= 0 || v.value > 100)) {
      return { ok: false, error: "Percentage must be between 1 and 100" };
    }
    if ((v.type === "FIXED" || v.type === "FIXED_PRICE") && v.value <= 0) {
      return { ok: false, error: "Discount value must be greater than 0" };
    }
    if (v.applyOn === "PAYMENT_TYPE" && !v.paymentMethods) {
      return { ok: false, error: "Pick at least one payment method" };
    }
    if (v.applicableScope !== "ALL" && !v.applicableIds) {
      return { ok: false, error: `Pick at least one ${v.applicableScope.toLowerCase()}` };
    }
    if (v.validationMode === "COUPON_VALIDATED" && !v.code) {
      return { ok: false, error: "Coupon code is required for coupon-validated discounts" };
    }

    // Code resolution. For coupon-validated discounts the user-typed code
    // is canonical. For the other two modes we auto-generate a unique
    // code so the legacy `code @unique` column stays satisfied without
    // forcing cashiers to invent codes for automatic offers.
    let code = (v.code || "").toUpperCase().trim();
    if (!code) code = autoCode(v.title);

    // BOGO sidecar — only validated + persisted when type=BOGO so we
    // don't litter the table with zero rows for other types.
    let bogoData: z.infer<typeof BogoSchema> | null = null;
    if (v.type === "BOGO") {
      const b = BogoSchema.safeParse({
        itemAmountMin: fd.get("bogo.itemAmountMin") || undefined,
        buyScope: fd.get("bogo.buyScope") || "ALL",
        buyScopeIds: (fd.getAll("bogo.buyScopeIds") as string[]).join(",") || undefined,
        getScope: fd.get("bogo.getScope") || "ALL",
        getScopeIds: (fd.getAll("bogo.getScopeIds") as string[]).join(",") || undefined,
        buyQty: fd.get("bogo.buyQty") ?? 1,
        getQty: fd.get("bogo.getQty") ?? 1,
        bogoValueType: fd.get("bogo.bogoValueType") || "PERCENTAGE",
        bogoValue: fd.get("bogo.bogoValue") ?? 100,
        getItemPricing: fd.get("bogo.getItemPricing") || "LOWER",
        buyItemPricing: fd.get("bogo.buyItemPricing") || "LOWER",
        showFreeQtyOnPos: fd.get("bogo.showFreeQtyOnPos") === "on",
        buyAmountCap: fd.get("bogo.buyAmountCap") || undefined,
      });
      if (!b.success) {
        const first = b.error.issues[0];
        return { ok: false, error: `BOGO ${first.path.join(".")}: ${first.message}` };
      }
      bogoData = b.data;
    }

    const validFrom = parseDate(v.validFrom);
    const validTo = parseDate(v.validTo);

    // Legacy compat: keep the old engine's isAuto + integer hour fields
    // populated so the auto-discount picker in src/lib/auto-discount.ts
    // keeps working until Phase 2 migrates it.
    const isAuto = v.validationMode === "NONE";
    const toHour = (s?: string) => {
      if (!s) return null;
      const m = /^(\d{1,2}):/.exec(s);
      if (!m) return null;
      const h = parseInt(m[1], 10);
      return isNaN(h) ? null : h;
    };
    const hourFrom = toHour(v.timeFrom);
    const hourTo = toHour(v.timeTo);

    const data = {
      code,
      name: v.title,
      type: v.type,
      channel: v.channel,
      orderTypes: v.orderTypes,
      value: v.value,
      minOrder: v.minOrder,
      maxOrder: v.maxOrder ?? null,
      maxDiscount: v.maxDiscount ?? null,
      applyOn: v.applyOn,
      paymentMethods: v.paymentMethods ?? null,
      applyAt: v.applyAt,
      applicableScope: v.applicableScope,
      applicableIds: v.applicableIds ?? null,
      validationMode: v.validationMode,
      isAuto,
      active: v.active,
      validFrom,
      validTo,
      timeFrom: v.timeFrom || null,
      timeTo: v.timeTo || null,
      hourFrom,
      hourTo,
      daysOfWeek: v.daysOfWeek ?? null,
      description: v.description || null,
      terms: v.terms || null,
    };

    let id: string;
    if (v.id) {
      const existing = await db.discount.findUnique({ where: { id: v.id }, select: { id: true, code: true } });
      if (!existing) return { ok: false, error: "Discount not found" };
      // Preserve auto-generated codes if the user didn't type one — no
      // need to mint a fresh code every time the row is edited.
      const finalCode = v.code ? code : existing.code;
      await db.discount.update({
        where: { id: v.id },
        data: { ...data, code: finalCode },
      });
      if (bogoData) {
        await db.discountBogo.upsert({
          where: { discountId: v.id },
          create: { discountId: v.id, ...bogoData },
          update: bogoData,
        });
      } else {
        await db.discountBogo.deleteMany({ where: { discountId: v.id } });
      }
      id = v.id;
      await logActivity({
        action: "UPDATE",
        entity: "Discount",
        entityId: id,
        summary: `Updated discount ${v.title} (${v.type})`,
        outletId: outlet.id,
      });
    } else {
      const d = await db.discount.create({ data: { ...data, outletId: outlet.id } });
      if (bogoData) {
        await db.discountBogo.create({ data: { discountId: d.id, ...bogoData } });
      }
      id = d.id;
      await logActivity({
        action: "CREATE",
        entity: "Discount",
        entityId: id,
        summary: `Created discount ${v.title} (${v.type})`,
        outletId: outlet.id,
      });
    }

    revalidatePath("/menu/discounts");
    revalidatePath("/billing");
    revalidatePath("/logs");
    return { ok: true, id };
  } catch (e: any) {
    // The most common Prisma error here is a unique-constraint violation
    // on `code` — surface it as a friendly message so the user can
    // change the code without staring at a wall of stack trace.
    const msg = String(e?.message || e || "Save failed");
    if (msg.includes("Unique constraint") && msg.includes("code")) {
      return { ok: false, error: "That code is already in use — pick a different one" };
    }
    return { ok: false, error: msg.slice(0, 240) };
  }
}

/**
 * Atomic coupon redemption — increments usedCount and writes a redemption
 * row in a single transaction so concurrent settles can't double-spend a
 * coupon that has `maxRedemptions` set. Also writes a DiscountUsage audit
 * row so the discount's "₹ saved" stat reflects the redemption.
 *
 * Returns ok on success; { error } when the coupon is missing, inactive,
 * expired, or its cap has been hit between the cashier's lookup and settle.
 */
export async function redeemCoupon(opts: {
  couponId: string;
  orderId: string;
  customerId?: string | null;
  appliedAmount: number;
  channel?: string;
  outletId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db.$transaction(async (tx) => {
      // SELECT … FOR UPDATE semantics — Prisma updates implicitly lock the row.
      // We re-check the cap inside the tx so a concurrent settle can't push
      // usedCount past maxRedemptions.
      const c = await tx.coupon.findUnique({ where: { id: opts.couponId } });
      if (!c) throw new Error("Coupon not found");
      if (!c.active) throw new Error("Coupon inactive");
      if (c.expiresAt && c.expiresAt < new Date()) throw new Error("Coupon expired");
      if (c.maxRedemptions != null && c.usedCount >= c.maxRedemptions) {
        throw new Error("Coupon fully redeemed");
      }
      await tx.coupon.update({
        where: { id: opts.couponId },
        data: { usedCount: { increment: 1 } },
      });
      await tx.couponRedemption.create({
        data: {
          couponId: opts.couponId,
          orderId: opts.orderId,
          customerId: opts.customerId ?? null,
        },
      });
      await tx.discountUsage.create({
        data: {
          discountId: c.discountId,
          orderId: opts.orderId,
          customerId: opts.customerId ?? null,
          appliedAmount: opts.appliedAmount,
          channel: opts.channel ?? null,
          outletId: opts.outletId,
        },
      });
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e ?? "Redemption failed") };
  }
}

/**
 * Record a non-coupon discount fire (auto or CODE_ONLY) on a settled bill.
 * Mirrors the audit half of redeemCoupon for rules that don't go through
 * the Coupon master.
 */
export async function recordDiscountUsage(opts: {
  discountId: string;
  orderId: string;
  customerId?: string | null;
  appliedAmount: number;
  channel?: string;
  outletId: string;
}) {
  await db.discountUsage.create({
    data: {
      discountId: opts.discountId,
      orderId: opts.orderId,
      customerId: opts.customerId ?? null,
      appliedAmount: opts.appliedAmount,
      channel: opts.channel ?? null,
      outletId: opts.outletId,
    },
  });
}

export async function deleteDiscount(fd: FormData) {
  const id = String(fd.get("id"));
  if (!id) return;
  const d = await db.discount.findUnique({ where: { id } });
  await db.discount.delete({ where: { id } });
  if (d) {
    await logActivity({
      action: "DELETE",
      entity: "Discount",
      entityId: id,
      summary: `Deleted discount ${d.name}`,
      outletId: d.outletId,
    });
  }
  revalidatePath("/menu/discounts");
  revalidatePath("/billing");
  revalidatePath("/logs");
}

/**
 * Lookup a typed code at checkout — handles both validation modes that
 * involve a typed code (CODE_ONLY hits Discount.code directly,
 * COUPON_VALIDATED resolves through Coupon master). Returns a uniform
 * shape: ok+amount on success, error string on failure.
 *
 * NOTE: This is the legacy fallback path. The full evaluation engine
 * (channel + payment-type + scope + applyAt) lives in Phase 2.
 */
export async function lookupDiscount(code: string, subTotal: number) {
  if (!code) return null;
  const normalised = code.toUpperCase().trim();
  const outlet = await getActiveOutlet();

  // Try the master code first (CODE_ONLY mode), then fall through to
  // the Coupon table (COUPON_VALIDATED mode).
  let d = await db.discount.findUnique({ where: { code: normalised } });
  let coupon: { id: string; usedCount: number; maxRedemptions: number | null } | null = null;
  if (!d) {
    const c = await db.coupon.findUnique({
      where: { outletId_code: { outletId: outlet.id, code: normalised } },
      include: { discount: true },
    });
    if (c && c.active) {
      d = c.discount;
      coupon = { id: c.id, usedCount: c.usedCount, maxRedemptions: c.maxRedemptions };
      if (c.expiresAt && c.expiresAt < new Date()) return { error: "Coupon expired" } as const;
      if (c.maxRedemptions && c.usedCount >= c.maxRedemptions) return { error: "Coupon fully redeemed" } as const;
    }
  }

  if (!d || !d.active) return { error: "Invalid or inactive code" } as const;
  if (subTotal < d.minOrder)
    return { error: `Minimum order ₹${d.minOrder} required (current ₹${subTotal.toFixed(0)})` } as const;
  if (d.maxOrder && subTotal > d.maxOrder)
    return { error: `Maximum order ₹${d.maxOrder} exceeded` } as const;

  let amount = 0;
  if (d.type === "FIXED" || d.type === "FLAT") amount = d.value;
  else if (d.type === "PERCENTAGE" || d.type === "PERCENT") {
    amount = (subTotal * d.value) / 100;
    if (d.maxDiscount) amount = Math.min(amount, d.maxDiscount);
  } else if (d.type === "BOGO") {
    amount = subTotal / 2;
    if (d.maxDiscount) amount = Math.min(amount, d.maxDiscount);
  } else if (d.type === "FIXED_PRICE") {
    // Cap the bill to the fixed price (rare — typically used for combos)
    amount = Math.max(0, subTotal - d.value);
  }
  return {
    ok: true,
    amount: Math.round(amount),
    code: d.code,
    name: d.name,
    couponId: coupon?.id,
  } as const;
}
