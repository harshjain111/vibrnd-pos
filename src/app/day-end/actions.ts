"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { logActivity } from "@/lib/audit";
import { inr } from "@/lib/utils";

const DENOMS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

const Input = z.object({
  businessDay: z.string(),
  expectedCash: z.coerce.number(),
  note: z.string().optional(),
});

export async function closeDay(fd: FormData) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const parsed = Input.parse({
    businessDay: fd.get("businessDay"),
    expectedCash: fd.get("expectedCash"),
    note: fd.get("note") || undefined,
  });

  const denomMap: Record<string, number> = {};
  let counted = 0;
  for (const d of DENOMS) {
    const v = Number(fd.get(`d_${d}`) ?? 0);
    denomMap[String(d)] = v;
    counted += v * d;
  }
  const variance = counted - parsed.expectedCash;
  const businessDay = new Date(parsed.businessDay);
  businessDay.setHours(0, 0, 0, 0);

  // Compute opening cash for the audit summary
  const cashEntries = await db.cashEntry.findMany({
    where: {
      outletId: outlet.id,
      createdAt: { gte: businessDay, lt: new Date(businessDay.getTime() + 86400000) },
    },
  });
  const opening = cashEntries.filter((c) => c.kind === "OPENING").reduce((s, c) => s + c.amount, 0);

  const dc = await db.dayClose.upsert({
    where: { outletId_businessDay: { outletId: outlet.id, businessDay } },
    update: {
      countedCash: counted,
      expectedCash: parsed.expectedCash,
      variance,
      denominations: JSON.stringify(denomMap),
      note: parsed.note,
      closedById: user?.id,
      openingCash: opening,
    },
    create: {
      outletId: outlet.id,
      businessDay,
      openingCash: opening,
      expectedCash: parsed.expectedCash,
      countedCash: counted,
      variance,
      denominations: JSON.stringify(denomMap),
      note: parsed.note,
      closedById: user?.id,
    },
  });

  await logActivity({
    action: "UPDATE",
    entity: "Outlet",
    entityId: dc.id,
    summary: `Day-close ${businessDay.toLocaleDateString("en-IN")} · expected ${inr(parsed.expectedCash)} · counted ${inr(counted)} · variance ${inr(variance)}${parsed.note ? ` · ${parsed.note}` : ""}`,
    outletId: outlet.id,
  });

  revalidatePath("/day-end");
  revalidatePath(`/day-end/${parsed.businessDay}`);
  revalidatePath("/logs");
  revalidatePath("/hq");
}
