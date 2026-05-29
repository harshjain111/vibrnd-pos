"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { logActivity } from "@/lib/audit";
import { inr } from "@/lib/utils";

// ---------- Plans ----------

const PlanInput = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  price: z.coerce.number().positive(),
  durationDays: z.coerce.number().int().positive().default(365),
  benefitItemId: z.string().optional(),
  benefitName: z.string().min(1),
  qtyPerDay: z.coerce.number().int().positive().default(1),
});

export async function savePlan(fd: FormData) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const parsed = PlanInput.parse({
    id: fd.get("id") || undefined,
    name: fd.get("name"),
    price: fd.get("price"),
    durationDays: fd.get("durationDays") || 365,
    benefitItemId: fd.get("benefitItemId") || undefined,
    benefitName: fd.get("benefitName"),
    qtyPerDay: fd.get("qtyPerDay") || 1,
  });

  if (parsed.id) {
    await db.membershipPlan.update({
      where: { id: parsed.id },
      data: { name: parsed.name, price: parsed.price, durationDays: parsed.durationDays },
    });
    await db.membershipBenefit.deleteMany({ where: { planId: parsed.id } });
    await db.membershipBenefit.create({
      data: {
        planId: parsed.id,
        name: parsed.benefitName,
        itemId: parsed.benefitItemId,
        qtyPerDay: parsed.qtyPerDay,
      },
    });
  } else {
    const plan = await db.membershipPlan.create({
      data: {
        name: parsed.name,
        price: parsed.price,
        durationDays: parsed.durationDays,
        outletId: outlet.id,
        benefits: {
          create: {
            name: parsed.benefitName,
            itemId: parsed.benefitItemId,
            qtyPerDay: parsed.qtyPerDay,
          },
        },
      },
    });
    await logActivity({
      action: "CREATE",
      entity: "Customer",
      entityId: plan.id,
      summary: `Created plan ${plan.name} ${inr(plan.price)}/year — benefit: ${parsed.benefitName}`,
      outletId: outlet.id,
    });
  }
  revalidatePath("/memberships");
}

// ---------- Enroll ----------

const Enroll = z.object({
  customerPhone: z.string().min(8),
  customerName: z.string().optional(),
  planId: z.string(),
});

export async function enrollMember(fd: FormData) {
  await requireUser("BILLER");
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const parsed = Enroll.parse({
    customerPhone: fd.get("customerPhone"),
    customerName: fd.get("customerName") || undefined,
    planId: fd.get("planId"),
  });

  const plan = await db.membershipPlan.findUnique({ where: { id: parsed.planId } });
  if (!plan) throw new Error("Plan not found");

  // Upsert customer
  const customer = await db.customer.upsert({
    where: { id: `cust-${parsed.customerPhone}` },
    update: { name: parsed.customerName ?? undefined },
    create: {
      id: `cust-${parsed.customerPhone}`,
      name: parsed.customerName ?? "Member",
      phone: parsed.customerPhone,
      outletId: outlet.id,
    },
  });

  // Refuse double-active
  const existing = await db.membership.findFirst({
    where: { customerId: customer.id, planId: plan.id, active: true, expiresAt: { gt: new Date() } },
  });
  if (existing) throw new Error("Customer already has an active membership on this plan");

  const now = new Date();
  const expires = new Date(now.getTime() + plan.durationDays * 86400000);
  const m = await db.membership.create({
    data: {
      customerId: customer.id,
      planId: plan.id,
      startsAt: now,
      expiresAt: expires,
    },
  });

  await logActivity({
    action: "CREATE",
    entity: "Customer",
    entityId: m.id,
    summary: `Enrolled ${customer.name} (${parsed.customerPhone}) on ${plan.name} · valid ${expires.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
    outletId: outlet.id,
  });
  revalidatePath("/memberships");
  revalidatePath(`/customers/${customer.id}`);
}

// ---------- OTP + redemption ----------

const LookupInput = z.object({ phone: z.string().min(4) });

export async function lookupMemberByPhone(phone: string) {
  const c = await db.customer.findFirst({ where: { id: `cust-${phone}` } });
  if (!c) return { error: "Customer not found" } as const;
  const m = await db.membership.findFirst({
    where: { customerId: c.id, active: true, expiresAt: { gt: new Date() } },
    include: { plan: { include: { benefits: { include: { item: true } } } } },
  });
  if (!m) return { error: "No active membership on this phone" } as const;
  return {
    membershipId: m.id,
    customerName: c.name,
    planName: m.plan.name,
    expiresAt: m.expiresAt.toISOString(),
    benefits: m.plan.benefits.map((b) => ({
      id: b.id,
      name: b.name,
      itemId: b.itemId,
      itemName: b.item?.name,
      qtyPerDay: b.qtyPerDay,
    })),
  };
}

/** Generate a 6-digit OTP for an active membership. In production this would SMS. */
export async function generateOtp(membershipId: string) {
  await requireUser("BILLER");
  const m = await db.membership.findUnique({
    where: { id: membershipId },
    include: { customer: true },
  });
  if (!m || !m.active || m.expiresAt < new Date()) return { error: "Inactive membership" } as const;

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min
  await db.membershipOtp.create({ data: { membershipId, code, expiresAt } });
  // Production: SMS this code to m.customer.phone. For now we return it so the UI can show it.
  return { ok: true, code, phone: m.customer.phone } as const;
}

const VerifyRedeem = z.object({
  membershipId: z.string(),
  benefitId: z.string(),
  code: z.string().length(6),
  orderId: z.string().optional(),
});

/**
 * Atomically verify OTP + record redemption. The DB unique constraint on
 * (membershipId, benefitId, businessDay) is the foolproof daily cap —
 * across all outlets, a second redemption the same day is REJECTED.
 */
export async function verifyAndRedeem(input: z.infer<typeof VerifyRedeem>) {
  await requireUser("BILLER");
  const outlet = await getActiveOutlet();
  const parsed = VerifyRedeem.parse(input);

  // Check OTP
  const otp = await db.membershipOtp.findFirst({
    where: {
      membershipId: parsed.membershipId,
      code: parsed.code,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return { error: "OTP invalid or expired" } as const;

  // Compute business day in IST (midnight)
  const now = new Date();
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);

  // Try to create the redemption — the unique constraint enforces the cap
  try {
    const r = await db.membershipRedemption.create({
      data: {
        membershipId: parsed.membershipId,
        benefitId: parsed.benefitId,
        businessDay: day,
        outletId: outlet.id,
        orderId: parsed.orderId,
      },
    });
    await db.membershipOtp.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
    await logActivity({
      action: "ADVANCE",
      entity: "Customer",
      entityId: parsed.membershipId,
      summary: `Member benefit redeemed (benefit ${parsed.benefitId}) at ${outlet.name}`,
      outletId: outlet.id,
    });
    return { ok: true, redemptionId: r.id } as const;
  } catch (e: any) {
    // P2002 = unique constraint failed
    if (e?.code === "P2002") {
      const earlier = await db.membershipRedemption.findFirst({
        where: { membershipId: parsed.membershipId, benefitId: parsed.benefitId, businessDay: day },
        include: { outlet: true },
      });
      const where = earlier?.outlet?.name ?? "another outlet";
      return { error: `Already redeemed today at ${where}. Daily cap is one per benefit.` } as const;
    }
    throw e;
  }
}

export async function deactivateMembership(fd: FormData) {
  await requireUser("MANAGER");
  const id = String(fd.get("id"));
  await db.membership.update({ where: { id }, data: { active: false } });
  revalidatePath("/memberships");
}
