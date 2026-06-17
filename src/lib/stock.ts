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
 * Kitchen / Bar / Housekeeping). The move is two-step:
 *
 *   • DISPATCH (Store Manager transfers)  → postInternalTransferSend  (−Store)
 *   • RECEIPT  (department raises a GRN)   → postInternalTransferReceive (+Dept)
 *
 * Each half writes ONE ledger row tagged to the relevant department, and
 * neither touches `currentQty` (stock never leaves the outlet — it just moves
 * between departments). Per-dept qty is reconstructed from the ledger via
 * `stockAtDepartment`, which subtracts in-transit (SENT-not-received) transfers
 * from the STORE balance so the dispatch shows up immediately.
 *
 * Kept here next to moveStock so anything mutating stock goes through one
 * file we can audit.
 */
async function postInternalTransferRow(input: {
  rawMaterialId: string;
  delta: number; // signed
  departmentId: string;
  refType: string; // "Transfer" | "Requisition"
  refId: string;
  note?: string;
}) {
  const rm = await db.rawMaterial.findUnique({ where: { id: input.rawMaterialId } });
  if (!rm) throw new Error("Raw material not found");
  // qtyBefore/qtyAfter stay equal to currentQty because outlet-total didn't
  // change. Per-dept totals are derived from the sum of entries per dept.
  await db.stockMovement.create({
    data: {
      rawMaterialId: input.rawMaterialId,
      delta: input.delta,
      reason: "INTERNAL_TRANSFER",
      refType: input.refType,
      refId: input.refId,
      qtyBefore: rm.currentQty,
      qtyAfter: rm.currentQty,
      outletId: rm.outletId,
      departmentId: input.departmentId,
      note: input.note,
    },
  });
}

/** Dispatch half — store drops now. Records a −qty row at the STORE dept.
 *  This row is for audit/movements only; `stockAtDepartment` derives the
 *  STORE balance from currentQty − distributed − in-transit, so it isn't
 *  double-counted. */
export async function postInternalTransferSend(input: {
  rawMaterialId: string;
  qty: number; // always positive
  fromDepartmentId: string;
  refType: string;
  refId: string;
  note?: string;
}) {
  await postInternalTransferRow({
    rawMaterialId: input.rawMaterialId,
    delta: -input.qty,
    departmentId: input.fromDepartmentId,
    refType: input.refType,
    refId: input.refId,
    note: input.note,
  });
}

/** Receipt half — department rises now. Records a +qty row at the receiving
 *  dept. Called when the department raises a GRN against a SENT transfer. */
export async function postInternalTransferReceive(input: {
  rawMaterialId: string;
  qty: number; // always positive
  toDepartmentId: string;
  refType: string;
  refId: string;
  note?: string;
}) {
  await postInternalTransferRow({
    rawMaterialId: input.rawMaterialId,
    delta: input.qty,
    departmentId: input.toDepartmentId,
    refType: input.refType,
    refId: input.refId,
    note: input.note,
  });
}

/**
 * One-shot internal transfer (dispatch + receive together). Retained as a
 * convenience wrapper for callers that move stock between departments
 * instantaneously (no pending-receipt step). The requisition flow no longer
 * uses this — it calls the two halves separately so the receiving department
 * confirms via a GRN.
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
  await postInternalTransferSend({
    rawMaterialId: input.rawMaterialId,
    qty: input.qty,
    fromDepartmentId: input.fromDepartmentId,
    refType: input.refType,
    refId: input.refId,
    note: input.note,
  });
  await postInternalTransferReceive({
    rawMaterialId: input.rawMaterialId,
    qty: input.qty,
    toDepartmentId: input.toDepartmentId,
    refType: input.refType,
    refId: input.refId,
    note: input.note,
  });
}

/**
 * Look up the (item, variant) recipe and apply its ingredient deltas to
 * stock — variant + addon aware (per the recipes redesign).
 *
 * Used by:
 *   • placeOrder (consume)      reverse=false
 *   • cancelOrder (refund)      reverse=true
 *   • editOrder.removeLine      reverse=true
 *   • createSalesReturn         reverse=true
 *
 * Rules:
 *   1. No variantName → no-op (recipes are per item+variant).
 *   2. Variant must exist on the item, recipe must exist.
 *   3. Base ingredients (addonId IS NULL) consume × itemQty.
 *   4. For each customer-selected addon (passed in `addons`), look up
 *      that addon by name and consume its ingredients × itemQty.
 *
 * "addons" is the JSON-snapshotted list of selected addons on the order
 * line — same shape as OrderItem.addonsJson: [{name, priceDelta}].
 *
 * Best-effort — failures are logged but don't roll back the caller.
 */
export async function applyRecipeStock(input: {
  itemId: string;
  variantName: string | null;
  qty: number;
  addons: { name: string }[];
  refId: string;
  refType: string;
  note?: string;
  /** When true, the delta sign is flipped (refund / sales-return / cancel). */
  reverse?: boolean;
}): Promise<void> {
  if (!input.variantName) return;

  const variant = await db.itemVariant.findFirst({
    where: { itemId: input.itemId, name: input.variantName },
  });
  if (!variant) return;

  const recipe = await db.recipe.findFirst({
    where: { itemId: input.itemId, itemVariantId: variant.id },
    include: { ingredients: true },
  });
  if (!recipe) return;

  const selectedAddonIds = new Set<string>();
  if (input.addons && input.addons.length > 0) {
    const names = input.addons.map((a) => a.name);
    const found = await db.addon.findMany({
      where: { itemId: input.itemId, name: { in: names } },
      select: { id: true },
    });
    for (const a of found) selectedAddonIds.add(a.id);
  }

  const sign = input.reverse ? 1 : -1;
  const reason: StockReason = input.reverse ? "CANCEL_REVERSE" : "SALE";

  for (const ing of recipe.ingredients) {
    const include = ing.addonId === null || selectedAddonIds.has(ing.addonId);
    if (!include) continue;
    await moveStock({
      rawMaterialId: ing.rawMaterialId,
      delta: sign * ing.qty * input.qty,
      reason,
      refType: input.refType,
      refId: input.refId,
      note: input.note,
    });
  }
}

/**
 * Compute how much of `rawMaterialId` currently sits at `departmentId`.
 *
 * Two cases:
 *
 *   STORE department (the inbound channel for every outlet):
 *     STORE qty = RawMaterial.currentQty − sum(movements at any OTHER
 *                  active department at this outlet)
 *     This handles three realities at once:
 *       (a) Seeded data sets currentQty without writing OPENING ledger
 *           rows. There's no "STORE += currentQty" event; we infer it.
 *       (b) Legacy stock-changing actions (POS settle consuming a
 *           recipe, GRN receipts before chain inventory landed) wrote
 *           movements with departmentId=null. Those rows shouldn't be
 *           subtracted from STORE because they ALREADY reduced
 *           currentQty.
 *       (c) Internal transfers from STORE to Kitchen/Bar/HK record
 *           BOTH a -STORE row AND a +OTHER row. We mustn't subtract
 *           the -STORE row twice — by counting only OTHER-dept rows
 *           we get STORE = currentQty − distributed.
 *     Worked example (Sugar): currentQty=8, Kitchen drew 5 via internal
 *     transfer → ledger has [{STORE: -5}, {KITCHEN: +5}], currentQty
 *     unchanged. STORE = 8 − (+5 at KITCHEN) = 3. ✓
 *
 *   Non-STORE department (Kitchen / Bar / Housekeeping / Other):
 *     simple ledger sum of all movements tagged with that departmentId.
 *
 * Used by requisition / transfer flows for "enough stock at source"
 * validation, and by the chain-stock matrix + per-dept stock view.
 */
export async function stockAtDepartment(rawMaterialId: string, departmentId: string): Promise<number> {
  const dept = await db.department.findUnique({ where: { id: departmentId } });
  if (!dept) return 0;

  if (dept.kind === "STORE") {
    const rm = await db.rawMaterial.findUnique({ where: { id: rawMaterialId } });
    if (!rm) return 0;
    // Sum movements at every OTHER department at the same outlet — these are
    // the amounts the departments have *received* and now hold.
    const otherDepts = await db.department.findMany({
      where: { outletId: dept.outletId, active: true, NOT: { id: dept.id } },
      select: { id: true },
    });
    const distributed =
      otherDepts.length === 0
        ? 0
        : Number(
            (
              await db.stockMovement.aggregate({
                where: { rawMaterialId, departmentId: { in: otherDepts.map((d) => d.id) } },
                _sum: { delta: true },
              })
            )._sum.delta ?? 0
          );

    // In-transit: stock the store has dispatched on an INTERNAL transfer that
    // the receiving department hasn't GRN'd yet. It's left the store but isn't
    // yet counted in any dept's holdings, so subtract it too.
    const inTransitAgg = await db.transferLine.aggregate({
      where: {
        rawMaterialId,
        transfer: { kind: "INTERNAL", status: "SENT", fromDepartmentId: dept.id },
      },
      _sum: { qtySent: true },
    });
    const inTransit = Number(inTransitAgg._sum.qtySent ?? 0);

    return Number((rm.currentQty - distributed - inTransit).toFixed(4));
  }

  // Non-STORE: pure ledger sum.
  const agg = await db.stockMovement.aggregate({
    where: { rawMaterialId, departmentId },
    _sum: { delta: true },
  });
  return Number(agg._sum.delta ?? 0);
}
