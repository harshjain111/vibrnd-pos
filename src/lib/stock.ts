import { db } from "./db";

export type StockReason =
  | "SALE"
  | "CANCEL_REVERSE"
  | "ADJUST"
  | "PURCHASE"
  | "WASTAGE"
  | "OPENING"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "PRODUCTION_IN"
  | "PRODUCTION_OUT"
  | "PRODUCTION_INPUT"
  | "PRODUCTION_OUTPUT"
  | "COUNT_ADJUST"
  | "SALES_RETURN"
  | "PURCHASE_RETURN"
  | "INTERNAL_TRANSFER"
  | "CHAIN_TRANSFER"
  | "GRN_RECEIPT";

type MoveInput = {
  rawMaterialId: string;
  delta: number; // signed; negative for consumption
  reason: StockReason;
  refType?: string;
  refId?: string;
  note?: string;
  /** Required for chain-inventory flows (requisitions / transfers / GRN /
   *  production). Optional + null for legacy callers (POS settle, etc.)
   *  that haven't been migrated to per-dept tracking yet. */
  departmentId?: string | null;
};

/**
 * Apply a stock delta to a raw material and record a StockMovement row.
 * Atomic from the model's POV — uses the current row qty to record before/after.
 */
export async function moveStock(input: MoveInput) {
  const before = await db.rawMaterial.findUnique({ where: { id: input.rawMaterialId } });
  if (!before) return;

  const after = await db.rawMaterial.update({
    where: { id: input.rawMaterialId },
    data: { currentQty: { increment: input.delta } },
  });

  try {
    await db.stockMovement.create({
      data: {
        rawMaterialId: input.rawMaterialId,
        delta: input.delta,
        reason: input.reason,
        refType: input.refType,
        refId: input.refId,
        qtyBefore: before.currentQty,
        qtyAfter: after.currentQty,
        note: input.note,
        outletId: before.outletId,
        departmentId: input.departmentId ?? null,
      },
    });
  } catch (err) {
    // Movement logging must never fail the stock change.
    console.error("[stock] movement log failed:", err);
  }

  // Low-stock notification — fires when crossing min OR par thresholds downward.
  // Best-effort: never let notification errors bubble up to the caller.
  try {
    const crossedMin = after.currentQty < before.minLevel && before.currentQty >= before.minLevel;
    const crossedPar = after.currentQty < before.parLevel && before.currentQty >= before.parLevel;
    if (crossedMin || crossedPar) {
      await db.notification.create({
        data: {
          outletId: before.outletId,
          kind: "LOW_STOCK",
          title: crossedMin ? `${before.name} below MIN level` : `${before.name} below PAR level`,
          body: `${before.name} is now at ${after.currentQty} (min ${before.minLevel}, par ${before.parLevel}). Time to reorder.`,
          link: `/inventory/available?q=${encodeURIComponent(before.name)}`,
        },
      });
    }
  } catch (err) {
    console.error("[stock] low-stock notification failed:", err);
  }
}

/**
 * Internal department-to-department transfer within the SAME outlet (Store →
 * Kitchen / Bar / Housekeeping). Logs as TWO ledger entries on the same
 * RawMaterial — one negative at the source dept, one positive at the
 * destination dept — without touching `currentQty` (the outlet still has
 * the same total). Per-dept qty is reconstructed from the ledger via
 * `stockAtDepartment`.
 *
 * Kept here next to moveStock so anything mutating stock goes through one
 * file we can audit.
 */
export async function postInternalTransferMovement(input: {
  rawMaterialId: string;
  qty: number; // always positive
  fromDepartmentId: string;
  toDepartmentId: string;
  refType: string; // "Transfer" | "Requisition"
  refId: string;
  note?: string;
}) {
  const rm = await db.rawMaterial.findUnique({ where: { id: input.rawMaterialId } });
  if (!rm) throw new Error("Raw material not found");
  // Two ledger rows — qtyBefore/qtyAfter stay equal to currentQty because
  // outlet-total didn't change. Per-dept totals are derived from the sum
  // of all entries with that departmentId.
  await db.stockMovement.createMany({
    data: [
      {
        rawMaterialId: input.rawMaterialId,
        delta: -input.qty,
        reason: "INTERNAL_TRANSFER",
        refType: input.refType,
        refId: input.refId,
        qtyBefore: rm.currentQty,
        qtyAfter: rm.currentQty,
        outletId: rm.outletId,
        departmentId: input.fromDepartmentId,
        note: input.note,
      },
      {
        rawMaterialId: input.rawMaterialId,
        delta: input.qty,
        reason: "INTERNAL_TRANSFER",
        refType: input.refType,
        refId: input.refId,
        qtyBefore: rm.currentQty,
        qtyAfter: rm.currentQty,
        outletId: rm.outletId,
        departmentId: input.toDepartmentId,
        note: input.note,
      },
    ],
  });
}

/**
 * Sum the ledger to compute how much of `rawMaterialId` currently sits in
 * `departmentId`. We special-case STORE: anything with `departmentId = null`
 * (legacy un-backfilled rows from before chain inventory landed) counts as
 * STORE so existing reports stay accurate.
 *
 * Called from requisition / transfer flows that need to validate "enough
 * stock at source dept" before mutating.
 */
export async function stockAtDepartment(rawMaterialId: string, departmentId: string): Promise<number> {
  const dept = await db.department.findUnique({ where: { id: departmentId } });
  const includeNullForStore = dept?.kind === "STORE";
  const where = includeNullForStore
    ? { rawMaterialId, OR: [{ departmentId }, { departmentId: null, outletId: dept!.outletId }] }
    : { rawMaterialId, departmentId };
  const agg = await db.stockMovement.aggregate({
    where,
    _sum: { delta: true },
  });
  return Number(agg._sum.delta ?? 0);
}
