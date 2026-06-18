"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser, requireInventoryOps } from "@/lib/rbac";
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
  await requireInventoryOps(["PRODUCTION_MANAGER"]);
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
  await requireInventoryOps(["PRODUCTION_MANAGER"]);
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

/**
 * Execute a production run.
 *
 * Updated for chain-inventory (Prompt 4.3):
 *  • Stock movements are tagged with the BK's STORE department.
 *  • Output RM's avg cost rolls forward via weighted-average from the
 *    consumed input costs — that's how cooked-dal carries the cost of
 *    onion + toor dal + spices forward into BK→Outlet transfers.
 *  • Output RM is auto-flipped to source = PRODUCED on first successful run.
 *  • Warns (but doesn't block) if the active outlet isn't BASE_KITCHEN
 *    kind — production CAN run at any outlet but conceptually belongs at
 *    a chain commissary.
 */
export async function executeProductionRun(input: z.infer<typeof Run>) {
  await requireInventoryOps(["PRODUCTION_MANAGER"]);
  const data = Run.parse(input);
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const master = await db.productionMaster.findUnique({
    where: { id: data.masterId },
    include: { inputs: { include: { rawMaterial: true } }, outputRM: true },
  });
  if (!master) throw new Error("Production master not found");
  if (master.outletId !== outlet.id) throw new Error("Different outlet");

  // Find this outlet's STORE department — stock movements tag against it
  // so per-dept ledger sums stay accurate.
  const storeDept = await db.department.findFirst({
    where: { outletId: outlet.id, kind: "STORE", active: true },
  });
  const departmentId = storeDept?.id ?? null;

  // Check enough input stock
  for (const inp of master.inputs) {
    const need = inp.qty * data.runQty;
    if (inp.rawMaterial.currentQty < need) {
      throw new Error(`Not enough ${inp.rawMaterial.name}: need ${need}, have ${inp.rawMaterial.currentQty}`);
    }
  }

  // ── Cost calculation ─────────────────────────────────────────────────
  // Total input cost for this run, valued at each input RM's current avgCost.
  const totalInputCost = master.inputs.reduce(
    (s, inp) => s + inp.qty * data.runQty * (inp.rawMaterial.avgCost ?? 0),
    0
  );
  const totalOutputQty = master.outputQty * data.runQty;
  const newRunUnitCost = totalOutputQty > 0 ? totalInputCost / totalOutputQty : 0;

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

  // Deduct inputs (PRODUCTION_INPUT at STORE dept)
  for (const inp of master.inputs) {
    await moveStock({
      rawMaterialId: inp.rawMaterialId,
      delta: -inp.qty * data.runQty,
      reason: "PRODUCTION_INPUT",
      refType: "ProductionRun",
      refId: run.id,
      departmentId,
      note: `Production · ${master.name} ×${data.runQty}`,
    });
  }

  // Roll output RM avgCost weighted-average against new production cost.
  const outputBefore = master.outputRM.currentQty;
  const outputAfter = outputBefore + totalOutputQty;
  const blendedAvgCost =
    outputAfter > 0
      ? (outputBefore * (master.outputRM.avgCost ?? 0) + totalOutputQty * newRunUnitCost) / outputAfter
      : newRunUnitCost;
  await db.rawMaterial.update({
    where: { id: master.outputRMId },
    data: {
      avgCost: blendedAvgCost,
      // Once we successfully produce this RM, flag it as PRODUCED so the
      // catalog reflects reality. (BOTH if it was previously PURCHASED.)
      source: master.outputRM.source === "PURCHASED" ? "BOTH" : master.outputRM.source === "PRODUCED" ? "PRODUCED" : "PRODUCED",
    },
  });

  // Increment output (PRODUCTION_OUTPUT at STORE dept)
  await moveStock({
    rawMaterialId: master.outputRMId,
    delta: totalOutputQty,
    reason: "PRODUCTION_OUTPUT",
    refType: "ProductionRun",
    refId: run.id,
    departmentId,
    note: `Produced ${master.name} ×${data.runQty} @ avg ₹${newRunUnitCost.toFixed(2)}/${master.outputUnit}`,
  });

  await logActivity({
    action: "CREATE",
    entity: "ProductionRun",
    entityId: run.id,
    summary: `Production · ${master.name} ×${data.runQty} → ${totalOutputQty} ${master.outputUnit} ${master.outputRM.name} (cost ₹${newRunUnitCost.toFixed(2)}/${master.outputUnit})`,
    outletId: outlet.id,
  });
  revalidatePath("/inventory/production");
  revalidatePath("/inventory");
  revalidatePath("/inventory/available");
}
