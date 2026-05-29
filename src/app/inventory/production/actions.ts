"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { moveStock } from "@/lib/stock";
import { logActivity } from "@/lib/audit";

const InputLine = z.object({
  rawMaterialId: z.string(),
  qty: z.coerce.number().positive(),
  unit: z.string(),
});

const SaveMaster = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  defaultQty: z.coerce.number().positive().default(1),
  outputRMId: z.string(),
  outputQty: z.coerce.number().positive(),
  outputUnit: z.string(),
  inputs: z.array(InputLine).min(1),
});

export async function saveProductionMaster(input: z.infer<typeof SaveMaster>) {
  await requireUser("MANAGER");
  const data = SaveMaster.parse(input);
  const outlet = await getActiveOutlet();
  if (data.id) {
    await db.productionInputLine.deleteMany({ where: { masterId: data.id } });
    await db.productionMaster.update({
      where: { id: data.id },
      data: {
        name: data.name,
        description: data.description,
        defaultQty: data.defaultQty,
        outputRMId: data.outputRMId,
        outputQty: data.outputQty,
        outputUnit: data.outputUnit,
        inputs: { create: data.inputs },
      },
    });
  } else {
    await db.productionMaster.create({
      data: {
        name: data.name,
        description: data.description,
        defaultQty: data.defaultQty,
        outputRMId: data.outputRMId,
        outputQty: data.outputQty,
        outputUnit: data.outputUnit,
        outletId: outlet.id,
        inputs: { create: data.inputs },
      },
    });
  }
  revalidatePath("/inventory/production");
}

export async function deleteProductionMaster(fd: FormData) {
  await requireUser("MANAGER");
  const id = String(fd.get("id") || "");
  if (!id) return;
  await db.productionMaster.delete({ where: { id } });
  revalidatePath("/inventory/production");
}

const Run = z.object({
  masterId: z.string(),
  runQty: z.coerce.number().positive(),
  type: z.enum(["DIRECT", "AGAINST_PO"]).default("DIRECT"),
  notes: z.string().optional(),
});

export async function executeProductionRun(input: z.infer<typeof Run>) {
  await requireUser("BILLER");
  const data = Run.parse(input);
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const master = await db.productionMaster.findUnique({
    where: { id: data.masterId },
    include: { inputs: { include: { rawMaterial: true } }, outputRM: true },
  });
  if (!master) throw new Error("Production master not found");
  if (master.outletId !== outlet.id) throw new Error("Different outlet");

  // Check enough input stock
  for (const inp of master.inputs) {
    const need = inp.qty * data.runQty;
    if (inp.rawMaterial.currentQty < need) {
      throw new Error(`Not enough ${inp.rawMaterial.name}: need ${need}, have ${inp.rawMaterial.currentQty}`);
    }
  }

  const run = await db.productionRun.create({
    data: {
      masterId: master.id,
      runQty: data.runQty,
      type: data.type,
      status: "EXECUTED",
      outletId: outlet.id,
      executedById: user?.id ?? null,
      notes: data.notes,
    },
  });

  // Deduct inputs, increment output
  for (const inp of master.inputs) {
    await moveStock({
      rawMaterialId: inp.rawMaterialId,
      delta: -inp.qty * data.runQty,
      reason: "PRODUCTION_OUT",
      refType: "ProductionRun",
      refId: run.id,
      note: `Production · ${master.name} ×${data.runQty}`,
    });
  }
  await moveStock({
    rawMaterialId: master.outputRMId,
    delta: master.outputQty * data.runQty,
    reason: "PRODUCTION_IN",
    refType: "ProductionRun",
    refId: run.id,
    note: `Produced ${master.name} ×${data.runQty}`,
  });

  await logActivity({
    action: "CREATE",
    entity: "ProductionRun",
    entityId: run.id,
    summary: `Executed ${master.name} ×${data.runQty} → ${master.outputQty * data.runQty} ${master.outputUnit} of ${master.outputRM.name}`,
    outletId: outlet.id,
  });
  revalidatePath("/inventory/production");
  revalidatePath("/inventory");
}
