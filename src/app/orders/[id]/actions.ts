"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { moveStock, applyRecipeStock } from "@/lib/stock";
import { assertOrderEditable } from "@/lib/day-close";
import { requireUser } from "@/lib/rbac";
import { canAccess, type PageId } from "@/lib/permissions";

/**
 * Throws if the calling role isn't permitted to use the given POS action.
 * Returns the user so the caller can attribute audit rows. We re-use the
 * same permission registry that gates the sidebar so the matrix in the
 * spec image is the single source of truth.
 */
async function gate(action: PageId) {
  const user = await requireUser();
  if (!canAccess(user.role, action)) {
    throw new Error(`Your role (${user.role}) is not permitted to perform this action.`);
  }
  return user;
}

/**
 * Recompute sub/tax/grand on an Order from its (non-voided) line items.
 * Used by every action that mutates lines — moveOrderItems, voidOrderLine,
 * splitBillByItem — so totals never drift from the items on screen.
 */
async function recomputeOrderTotals(orderId: string) {
  const lines = await db.orderItem.findMany({
    where: { orderId, voidedAt: null },
  });
  const sub = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const tax = lines.reduce((s, l) => s + l.price * l.qty * (l.taxRate / 100), 0);
  await db.order.update({
    where: { id: orderId },
    data: { subTotal: sub, taxTotal: tax, grandTotal: Math.round(sub + tax) },
  });
  return { sub, tax, grand: Math.round(sub + tax) };
}

const CancelInput = z.object({
  id: z.string(),
  reason: z.string().optional(),
});

export async function cancelOrder(input: z.infer<typeof CancelInput>) {
  const user = await requireUser("MANAGER");
  const { id, reason } = CancelInput.parse(input);
  const o = await db.order.findUnique({ where: { id } });
  if (!o) throw new Error("Order not found");
  if (o.status === "CANCELLED") return;
  // Bills become immutable after their business day is closed unless an Owner overrides.
  await assertOrderEditable(o, user.role);

  await db.order.update({
    where: { id },
    data: { status: "CANCELLED", notes: reason ? `Cancelled: ${reason}` : "Cancelled" },
  });

  // Cancel any active KOTs tied to this order
  await db.kitchenTicket.updateMany({
    where: { orderId: id, status: { in: ["NEW", "IN_PROGRESS", "READY"] } },
    data: { status: "CANCELLED" },
  });

  // Reverse stock decrement via the recipe (variant + addon aware).
  const items = await db.orderItem.findMany({ where: { orderId: id } });
  for (const li of items) {
    const addons: { name: string }[] = li.addonsJson
      ? (() => {
          try {
            return JSON.parse(li.addonsJson) as { name: string }[];
          } catch {
            return [];
          }
        })()
      : [];
    await applyRecipeStock({
      itemId: li.itemId,
      variantName: li.variantName ?? null,
      qty: li.qty,
      addons,
      refId: id,
      refType: "Order",
      reverse: true,
      note: `Reverse ${o.invoiceNo} · ${li.name} ×${li.qty}`,
    });
  }

  await logActivity({
    action: "CANCEL",
    entity: "Order",
    entityId: id,
    summary: `Cancelled ${o.invoiceNo}`,
    outletId: o.outletId,
    reason: reason ?? undefined,
    oldValue: { status: o.status, grandTotal: o.grandTotal },
    newValue: { status: "CANCELLED", grandTotal: 0 },
  });

  revalidatePath("/");
  revalidatePath("/orders");
  revalidatePath("/orders/live");
  revalidatePath(`/orders/${id}`);
  revalidatePath("/kds");
  revalidatePath("/logs");
}

export async function reopenOrder(formData: FormData) {
  const user = await requireUser("MANAGER");
  const id = String(formData.get("id"));
  const o = await db.order.findUnique({ where: { id } });
  if (!o) return;
  await assertOrderEditable(o, user.role);
  await db.order.update({ where: { id }, data: { status: "PRINTED", closedAt: null, notes: null } });
  await logActivity({
    action: "UPDATE",
    entity: "Order",
    entityId: id,
    summary: `Reopened ${o.invoiceNo}`,
    outletId: o.outletId,
  });
  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
  revalidatePath("/logs");
}

const SplitInput = z.object({
  id: z.string(),
  moveItemIds: z.array(z.string()).min(1, "Pick at least one item to move to the new bill"),
});

/**
 * Split bill v1 (audit TASK 11) — move the picked line items to a brand-new
 * Order; the original keeps what's left. Only allowed on unsettled bills.
 * Each split creates a fresh invoice number and copies customer + table.
 */
export async function splitBillByItem(input: z.infer<typeof SplitInput>) {
  const user = await requireUser("MANAGER");
  const { id, moveItemIds } = SplitInput.parse(input);
  const orig = await db.order.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!orig) throw new Error("Order not found");
  if (orig.status === "CANCELLED" || orig.status === "PAID") {
    throw new Error(`Cannot split a ${orig.status.toLowerCase()} bill.`);
  }
  await assertOrderEditable(orig, user.role);

  const moving = orig.items.filter((i) => moveItemIds.includes(i.id));
  const remaining = orig.items.filter((i) => !moveItemIds.includes(i.id));
  if (moving.length === 0) throw new Error("No matching items to move.");
  if (remaining.length === 0) throw new Error("Pick fewer items — original bill must keep at least one line.");

  // Build a fresh invoice number for the new bill.
  const count = await db.order.count({ where: { outletId: orig.outletId } });
  const padded = String(count + 1).padStart(6, "0");
  const splitInvoice = `INV-${padded}-S`;

  // Totals for both halves.
  const totalOf = (lines: typeof orig.items) => {
    const sub = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const tax = lines.reduce((s, l) => s + l.price * l.qty * (l.taxRate / 100), 0);
    return { sub, tax, grand: Math.round(sub + tax) };
  };
  const tA = totalOf(remaining);
  const tB = totalOf(moving);

  // Create the new bill with the moved items.
  const splitOrder = await db.order.create({
    data: {
      invoiceNo: splitInvoice,
      orderType: orig.orderType,
      channel: orig.channel,
      status: "PRINTED",
      subTotal: tB.sub,
      taxTotal: tB.tax,
      grandTotal: tB.grand,
      outletId: orig.outletId,
      tableId: orig.tableId,
      customerId: orig.customerId,
      notes: `Split from ${orig.invoiceNo}`,
    },
  });
  // Move each picked line over to the new order.
  await db.orderItem.updateMany({
    where: { id: { in: moveItemIds } },
    data: { orderId: splitOrder.id },
  });
  // Update original totals.
  await db.order.update({
    where: { id: orig.id },
    data: {
      subTotal: tA.sub,
      taxTotal: tA.tax,
      grandTotal: tA.grand,
      notes: `${orig.notes ? `${orig.notes} · ` : ""}Split: ${moving.length} item(s) moved → ${splitInvoice}`,
    },
  });

  await logActivity({
    action: "UPDATE",
    entity: "Order",
    entityId: id,
    summary: `Split ${orig.invoiceNo} → ${splitInvoice} (${moving.length} item${moving.length === 1 ? "" : "s"})`,
    outletId: orig.outletId,
  });

  revalidatePath(`/orders/${id}`);
  revalidatePath(`/orders/${splitOrder.id}`);
  revalidatePath("/orders");
  revalidatePath("/orders/live");
  revalidatePath("/logs");
  return { splitId: splitOrder.id, splitInvoice };
}

const CompInput = z.object({
  id: z.string(),
  reason: z.string().min(3, "Reason is required"),
});

/**
 * Comp / Complimentary — zero the bill and capture why.
 * Counts as a leakage signal (Sprint 2 acceptance gate). Manager-only.
 */
export async function compOrder(fd: FormData) {
  const user = await requireUser("MANAGER");
  const { id, reason } = CompInput.parse({
    id: fd.get("id"),
    reason: fd.get("reason"),
  });
  const o = await db.order.findUnique({ where: { id } });
  if (!o) throw new Error("Order not found");
  await assertOrderEditable(o, user.role);

  await db.order.update({
    where: { id },
    data: {
      status: "PAID",
      paymentMode: "COMP",
      grandTotal: 0,
      amountPaid: 0,
      discount: o.subTotal + o.taxTotal,
      notes: `${o.notes ? `${o.notes} · ` : ""}Complimentary: ${reason}`,
      closedAt: new Date(),
    },
  });
  await logActivity({
    action: "UPDATE",
    entity: "Order",
    entityId: id,
    summary: `Complimentary ${o.invoiceNo}`,
    outletId: o.outletId,
    reason,
    oldValue: { status: o.status, paymentMode: o.paymentMode, grandTotal: o.grandTotal },
    newValue: { status: "PAID", paymentMode: "COMP", grandTotal: 0 },
  });
  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
  revalidatePath("/logs");
}

const ReprintInput = z.object({ id: z.string(), reason: z.string().min(3, "Reason is required (min 3 chars)") });

/** Re-print bill (audit TASK 10). Captures reason → audit trail + leakage signal. */
export async function reprintBill(fd: FormData) {
  await requireUser("BILLER");
  const { id, reason } = ReprintInput.parse({
    id: fd.get("id"),
    reason: fd.get("reason"),
  });
  const o = await db.order.findUnique({ where: { id } });
  if (!o) throw new Error("Order not found");
  await db.order.update({
    where: { id },
    data: { reprintCount: { increment: 1 }, reprintReason: reason },
  });
  await logActivity({
    action: "UPDATE",
    entity: "Order",
    entityId: id,
    summary: `Re-printed ${o.invoiceNo} (${o.reprintCount + 1}x)`,
    outletId: o.outletId,
    reason,
    oldValue: { reprintCount: o.reprintCount },
    newValue: { reprintCount: o.reprintCount + 1 },
  });
  revalidatePath(`/orders/${id}`);
  revalidatePath("/logs");
}

/* ─────────────────────────────────────────────────────────────────────────
 * POS access-matrix actions (Move Table / Move Items / Change Customer /
 * Void Item). Each one re-uses the canAccess gate so the permission keys
 * in src/lib/permissions.ts decide who can run them. Audit rows are
 * mandatory — every action emits an ActivityLog entry with old + new
 * value where applicable. ───────────────────────────────────────────── */

const MoveTableInput = z.object({
  id: z.string(),
  tableId: z.string().min(1, "Pick a table"),
});

/**
 * Reassign an open order to a different table. Receipt + KDS pages reload
 * to reflect the new table name. The old table free's up automatically
 * because the floor plan reads `tableId` directly.
 */
export async function moveTable(input: z.infer<typeof MoveTableInput>) {
  const user = await gate("pos.action.move_table");
  const { id, tableId } = MoveTableInput.parse(input);
  const o = await db.order.findUnique({ where: { id }, include: { table: true } });
  if (!o) throw new Error("Order not found");
  if (o.status === "CANCELLED" || o.status === "PAID") {
    throw new Error(`Cannot move a ${o.status.toLowerCase()} bill.`);
  }
  await assertOrderEditable(o, user.role);

  const newTable = await db.diningTable.findUnique({ where: { id: tableId } });
  if (!newTable || newTable.outletId !== o.outletId) throw new Error("Invalid table");
  if (newTable.id === o.tableId) return { ok: true, unchanged: true };

  // Block if the target table is already occupied by another running order.
  // Cashier should split or merge first rather than collide silently.
  const occupied = await db.order.findFirst({
    where: {
      outletId: o.outletId,
      tableId: newTable.id,
      status: { notIn: ["PAID", "CANCELLED"] },
      id: { not: o.id },
    },
    select: { invoiceNo: true },
  });
  if (occupied) {
    throw new Error(`Table ${newTable.name} already has running order ${occupied.invoiceNo}`);
  }

  await db.order.update({ where: { id }, data: { tableId: newTable.id } });

  await logActivity({
    action: "UPDATE",
    entity: "Order",
    entityId: id,
    summary: `Moved ${o.invoiceNo}: ${o.table?.name ?? "—"} → ${newTable.name}`,
    outletId: o.outletId,
    oldValue: { tableId: o.tableId, tableName: o.table?.name ?? null },
    newValue: { tableId: newTable.id, tableName: newTable.name },
  });

  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
  revalidatePath("/orders/live");
  revalidatePath("/logs");
  return { ok: true as const };
}

const MoveItemsInput = z.object({
  sourceOrderId: z.string(),
  targetOrderId: z.string(),
  itemIds: z.array(z.string()).min(1, "Pick at least one line"),
});

/**
 * Shift specific line items from one running order to another. Both orders
 * must be unsettled and on the same outlet. The targets receive the lines
 * and inherit their cost; sub/tax/grand are re-computed for both bills.
 * This powers the "Item shifting between tables" cell in the access matrix.
 */
export async function moveOrderItems(input: z.infer<typeof MoveItemsInput>) {
  const user = await gate("pos.action.item_shift");
  const { sourceOrderId, targetOrderId, itemIds } = MoveItemsInput.parse(input);
  if (sourceOrderId === targetOrderId) throw new Error("Pick a different target bill");

  const [src, dst] = await Promise.all([
    db.order.findUnique({ where: { id: sourceOrderId }, include: { items: true } }),
    db.order.findUnique({ where: { id: targetOrderId }, select: { id: true, outletId: true, status: true, invoiceNo: true } }),
  ]);
  if (!src) throw new Error("Source order not found");
  if (!dst) throw new Error("Target order not found");
  if (src.outletId !== dst.outletId) throw new Error("Cross-outlet shift is not supported");
  if (["PAID", "CANCELLED"].includes(src.status)) throw new Error("Source bill is closed");
  if (["PAID", "CANCELLED"].includes(dst.status)) throw new Error("Target bill is closed");
  await assertOrderEditable(src, user.role);

  const moving = src.items.filter((i) => itemIds.includes(i.id) && i.voidedAt == null);
  if (moving.length === 0) throw new Error("No matching items to move");
  const remainingActive = src.items.filter((i) => i.voidedAt == null && !itemIds.includes(i.id));
  if (remainingActive.length === 0) {
    throw new Error("Leave at least one item on the source bill — use Cancel or Settle to close it instead.");
  }

  await db.orderItem.updateMany({
    where: { id: { in: moving.map((m) => m.id) } },
    data: { orderId: dst.id },
  });
  await Promise.all([recomputeOrderTotals(src.id), recomputeOrderTotals(dst.id)]);

  await logActivity({
    action: "UPDATE",
    entity: "Order",
    entityId: src.id,
    summary: `Shifted ${moving.length} item${moving.length === 1 ? "" : "s"} from ${src.invoiceNo} → ${dst.invoiceNo}`,
    outletId: src.outletId,
  });

  revalidatePath(`/orders/${src.id}`);
  revalidatePath(`/orders/${dst.id}`);
  revalidatePath("/orders");
  revalidatePath("/orders/live");
  revalidatePath("/logs");
  return { ok: true as const, moved: moving.length };
}

const ChangeCustomerInput = z.object({
  id: z.string(),
  customerName: z.string().min(1).max(80),
  customerPhone: z.string().max(20).optional(),
});

/**
 * Update the displayed customer name / phone on an open or settled bill.
 * Does NOT touch the Customer record — this is purely the receipt-facing
 * label (matches the spec's "Change Customer Name" row). Both old + new
 * values land in the audit log.
 */
export async function changeCustomerName(input: z.infer<typeof ChangeCustomerInput>) {
  const user = await gate("pos.action.change_customer");
  const { id, customerName, customerPhone } = ChangeCustomerInput.parse(input);
  const o = await db.order.findUnique({ where: { id } });
  if (!o) throw new Error("Order not found");
  await assertOrderEditable(o, user.role);

  await db.order.update({
    where: { id },
    data: {
      customerName: customerName.trim(),
      customerPhone: customerPhone?.trim() || o.customerPhone,
    },
  });

  await logActivity({
    action: "UPDATE",
    entity: "Order",
    entityId: id,
    summary: `Customer name: "${o.customerName ?? "—"}" → "${customerName.trim()}"`,
    outletId: o.outletId,
    oldValue: { name: o.customerName ?? null, phone: o.customerPhone ?? null },
    newValue: { name: customerName.trim(), phone: customerPhone?.trim() || o.customerPhone || null },
  });

  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
  revalidatePath("/orders/live");
  revalidatePath("/logs");
  return { ok: true as const };
}

const CloseTableInput = z.object({ id: z.string() });

/**
 * Final step in the Cashier flow (Box 4 of the spec image — "Close
 * Table"). For DINE_IN orders this:
 *   • Stamps Order.closedAt so the audit trail captures who released
 *     the table (the bill may have been auto-settled earlier).
 *   • Audit-logs a CLOSE_TABLE entry with the old / new state.
 *
 * The floor plan reads `status NOT IN (PAID, CANCELLED)` to decide
 * occupancy, so closing already free's up the table — this action
 * exists for explicit human attribution + audit completeness.
 */
export async function closeTable(input: z.infer<typeof CloseTableInput>) {
  const user = await gate("pos.action.settle_bill");
  const { id } = CloseTableInput.parse(input);
  const o = await db.order.findUnique({ where: { id }, include: { table: true } });
  if (!o) throw new Error("Order not found");
  if (o.status !== "PAID") throw new Error("Only paid bills can be closed — settle the bill first");
  if (!o.tableId) throw new Error("This bill isn't linked to a table");
  if (o.closedAt) return { ok: true, alreadyClosed: true } as const;

  const closedAt = new Date();
  await db.order.update({ where: { id }, data: { closedAt } });

  await logActivity({
    action: "UPDATE",
    entity: "Order",
    entityId: id,
    summary: `Closed table ${o.table?.name ?? "—"} (${o.invoiceNo})`,
    outletId: o.outletId,
    oldValue: { closedAt: o.closedAt, tableFree: false },
    newValue: { closedAt, tableFree: true },
  });

  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders/live");
  revalidatePath("/logs");
  return { ok: true } as const;
}

const VoidLineInput = z.object({
  id: z.string(), // order id
  lineId: z.string(),
  reason: z.string().min(3, "Reason is required"),
});

/**
 * Soft-void a single line item. Manager-only per the access matrix. The
 * row is preserved (audit trail) but flagged with voidedAt — totals
 * recompute to exclude it. Stock that was decremented by recipe is
 * reversed so the kitchen's mise-en-place tracking stays accurate.
 */
export async function voidOrderLine(input: z.infer<typeof VoidLineInput>) {
  const user = await gate("pos.action.void_item");
  const { id, lineId, reason } = VoidLineInput.parse(input);
  const o = await db.order.findUnique({ where: { id } });
  if (!o) throw new Error("Order not found");
  if (o.status === "CANCELLED") throw new Error("Order already cancelled");
  await assertOrderEditable(o, user.role);

  const line = await db.orderItem.findUnique({ where: { id: lineId } });
  if (!line || line.orderId !== id) throw new Error("Line not found on this order");
  if (line.voidedAt) throw new Error("Line already voided");

  await db.orderItem.update({
    where: { id: lineId },
    data: { voidedAt: new Date(), voidReason: reason },
  });

  // Reverse recipe-based stock for just this line.
  const addons: { name: string }[] = line.addonsJson
    ? (() => {
        try {
          return JSON.parse(line.addonsJson) as { name: string }[];
        } catch {
          return [];
        }
      })()
    : [];
  await applyRecipeStock({
    itemId: line.itemId,
    variantName: line.variantName ?? null,
    qty: line.qty,
    addons,
    refId: id,
    refType: "Order",
    reverse: true,
    note: `Void ${o.invoiceNo} · ${line.name} ×${line.qty}`,
  });

  await recomputeOrderTotals(id);

  await logActivity({
    action: "UPDATE",
    entity: "Order",
    entityId: id,
    summary: `Voided line "${line.name}" ×${line.qty} from ${o.invoiceNo}`,
    outletId: o.outletId,
    reason,
    oldValue: { lineId, name: line.name, qty: line.qty, price: line.price, voided: false },
    newValue: { lineId, name: line.name, qty: line.qty, price: line.price, voided: true },
  });

  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
  revalidatePath("/orders/live");
  revalidatePath("/kds");
  revalidatePath("/logs");
  return { ok: true as const };
}
