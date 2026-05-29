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
  | "COUNT_ADJUST"
  | "SALES_RETURN"
  | "PURCHASE_RETURN";

type MoveInput = {
  rawMaterialId: string;
  delta: number; // signed; negative for consumption
  reason: StockReason;
  refType?: string;
  refId?: string;
  note?: string;
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
      },
    });
  } catch (err) {
    // Movement logging must never fail the stock change.
    console.error("[stock] movement log failed:", err);
  }
}
