"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser, requireInventoryOps } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { logActivity } from "@/lib/audit";

const LineSchema = z.object({
  rawMaterialId: z.string(),
  countedQty: z.coerce.number().nonnegative(),
  comments: z.string().optional(),
});

const Save = z.object({
  businessDay: z.string(),
  lines: z.array(LineSchema),
});

function midnight(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function saveClosing(input: z.infer<typeof Save>) {
  await requireInventoryOps();
  const data = Save.parse(input);
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const day = midnight(new Date(data.businessDay));

  // Upsert the header for (outlet, day, DAY_END)
  const header = await db.stockCount.upsert({
    where: { outletId_businessDay_countType: { outletId: outlet.id, businessDay: day, countType: "DAY_END" } },
    update: { countedById: user?.id ?? null },
    create: {
      outletId: outlet.id,
      businessDay: day,
      countType: "DAY_END",
      countedById: user?.id ?? null,
    },
  });
  if (header.frozen) throw new Error("Closing for this day is frozen — unfreeze first to edit");

  // Replace all lines for this count
  await db.stockCountLine.deleteMany({ where: { countId: header.id } });
  // Get expected qty for each RM (current snapshot at time of count)
  const rms = await db.rawMaterial.findMany({
    where: { id: { in: data.lines.map((l) => l.rawMaterialId) } },
  });
  const rmMap = new Map(rms.map((r) => [r.id, r]));
  await db.stockCountLine.createMany({
    data: data.lines.map((l) => {
      const rm = rmMap.get(l.rawMaterialId);
      const expected = rm?.currentQty ?? 0;
      return {
        countId: header.id,
        rawMaterialId: l.rawMaterialId,
        expectedQty: expected,
        countedQty: l.countedQty,
        variance: l.countedQty - expected,
        comments: l.comments,
      };
    }),
  });
  await logActivity({
    action: "CREATE",
    entity: "StockCount",
    entityId: header.id,
    summary: `Saved day-end closing stock for ${day.toISOString().slice(0, 10)} · ${data.lines.length} lines`,
    outletId: outlet.id,
  });
  revalidatePath("/inventory/closing");
}

export async function freezeClosing(fd: FormData) {
  await requireInventoryOps();
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const day = midnight(new Date(String(fd.get("businessDay"))));
  const header = await db.stockCount.findUnique({
    where: { outletId_businessDay_countType: { outletId: outlet.id, businessDay: day, countType: "DAY_END" } },
  });
  if (!header) throw new Error("Nothing to freeze — save closing first");
  await db.stockCount.update({
    where: { id: header.id },
    data: { frozen: true, frozenById: user?.id ?? null, frozenAt: new Date() },
  });
  await logActivity({
    action: "UPDATE",
    entity: "StockCount",
    entityId: header.id,
    summary: `Froze closing stock for ${day.toISOString().slice(0, 10)}`,
    outletId: outlet.id,
  });
  revalidatePath("/inventory/closing");
}

export async function unfreezeClosing(fd: FormData) {
  await requireUser("OWNER");
  const outlet = await getActiveOutlet();
  const day = midnight(new Date(String(fd.get("businessDay"))));
  const header = await db.stockCount.findUnique({
    where: { outletId_businessDay_countType: { outletId: outlet.id, businessDay: day, countType: "DAY_END" } },
  });
  if (!header) return;
  await db.stockCount.update({
    where: { id: header.id },
    data: { frozen: false, frozenById: null, frozenAt: null },
  });
  await logActivity({
    action: "UPDATE",
    entity: "StockCount",
    entityId: header.id,
    summary: `Owner unfroze closing stock for ${day.toISOString().slice(0, 10)}`,
    outletId: outlet.id,
  });
  revalidatePath("/inventory/closing");
}
