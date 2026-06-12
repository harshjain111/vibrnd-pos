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
    // Sum movements at every OTHER department at the same outlet.
    const otherDepts = await db.department.findMany({
      where: { outletId: dept.outletId, active: true, NOT: { id: dept.id } },
      select: { id: true },
    });
    if (otherDepts.length === 0) return rm.currentQty;
    const agg = await db.stockMovement.aggregate({
      where: {
        rawMaterialId,
        departmentId: { in: otherDepts.map((d) => d.id) },
      },
      _sum: { delta: true },
    });
    const distributed = Number(agg._sum.delta ?? 0);
    return Number((rm.currentQty - distributed).toFixed(4));
  }

  // Non-STORE: pure ledger sum.
  const agg = await db.stockMovement.aggregate({
    where: { rawMaterialId, departmentId },
    _sum: { delta: true },
  });
  return Number(agg._sum.delta ?? 0);
}
