"use server";
/**
 * Purchase Order state machine — chain-inventory v2.
 *
 *   DRAFT ──submit──► PENDING_CC_APPROVAL ──CC approves──► APPROVED ──SM sends──► SENT
 *                       │  (skipped when outlet.requireCostControlApproval=false:           │
 *                       │   submit auto-promotes DRAFT → APPROVED)                          │
 *                       ▼                                                                   │
 *                     REJECTED                                                              │
 *                                                                                           │
 *                                                                                           ▼
 *                                                                           PARTIALLY_RECEIVED (each GRN)
 *                                                                                           │
 *                                                                                           ▼
 *                                                                                       CLOSED (or CANCELLED)
 *
 * Stock movement on GRN save (not here). PO close just flags the doc when
 * cumulative GRN receipts ≥ ordered qty on every line.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { canAccess } from "@/lib/permissions";
import { logActivity } from "@/lib/audit";
import { inr } from "@/lib/utils";

const LineInput = z.object({
  rawMaterialId: z.string(),
  qty: z.coerce.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.coerce.number().nonnegative(),
  /** Optional rate-card flags — set by the PO builder client. Server
   *  persists them on PurchaseOrderLine and fires a manager notification
   *  when any line is off-card or has an overridden rate. */
  offCard: z.boolean().default(false),
  rateChangedFrom: z.coerce.number().optional(),
  rateChangeReason: z.string().optional(),
});

const POInput = z.object({
  supplierId: z.string(),
  notes: z.string().optional(),
  lines: z.array(LineInput).min(1),
  /** Optional — when raised from an APPROVED req's shortfall the SM picked
   *  "Raise PO" on the requisition. Recorded for traceability + dashboards. */
  requisitionId: z.string().optional(),
  /** When true, the PO is created AND submitted for CC approval in one
   *  shot (matches the submitPO state transition). Lets the SM skip the
   *  intermediate draft step when they don't need to revise anything. */
  submitForApproval: z.boolean().default(false),
});

// Multi-supplier auto-PO input — spec section 2. The SM picks N items
// from the catalog, each with its preferred supplier + qty + rate. The
// server groups by supplierId and creates one DRAFT PO per supplier,
// tagged with the same batchKey so the list view can show "3 draft POs
// from this auto-PO". Each row is positional, like the cart in /billing.
const AutoLineInput = z.object({
  rawMaterialId: z.string(),
  supplierId: z.string(),
  qty: z.coerce.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.coerce.number().nonnegative(),
  offCard: z.boolean().default(false),
});
const AutoPOInput = z.object({
  lines: z.array(AutoLineInput).min(1, "Pick at least one item"),
  notes: z.string().optional(),
});

async function nextPoNo(outletId: string, outletCode: string) {
  const count = await db.purchaseOrder.count({ where: { outletId } });
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `PO-${outletCode}-${String(count + 1 + attempt).padStart(6, "0")}`;
    const clash = await db.purchaseOrder.findUnique({ where: { poNo: candidate } });
    if (!clash) return candidate;
  }
  throw new Error("Could not allocate a PO number");
}

async function getStoreDept(outletId: string) {
  const store = await db.department.findFirst({
    where: { outletId, kind: "STORE", active: true },
    orderBy: { createdAt: "asc" },
  });
  if (!store) throw new Error("No STORE department for this outlet");
  return store;
}

/**
 * When the SM saved a PO with off-card lines or overridden rates, fire one
 * Notification per change to whoever is reading the bell — managers /
 * owners see the audit story in the inbox without having to crawl logs.
 */
async function alertOnRateCardDeviations(opts: {
  outletId: string;
  poId: string;
  poNo: string;
  supplierName: string;
  lines: { rawMaterialId: string; offCard: boolean; rateChangedFrom?: number; unitPrice: number; rateChangeReason?: string }[];
}) {
  const flagged = opts.lines.filter((l) => l.offCard || l.rateChangedFrom !== undefined);
  if (flagged.length === 0) return;
  // Hydrate raw-material names so the alert reads naturally.
  const rms = await db.rawMaterial.findMany({
    where: { id: { in: flagged.map((l) => l.rawMaterialId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(rms.map((r) => [r.id, r.name]));
  const offCount = flagged.filter((l) => l.offCard).length;
  const rateCount = flagged.filter((l) => !l.offCard && l.rateChangedFrom !== undefined).length;
  const title = `PO ${opts.poNo} — rate-card deviation${flagged.length === 1 ? "" : "s"}`;
  const bodyLines: string[] = [];
  if (offCount > 0) bodyLines.push(`${offCount} off-card line${offCount === 1 ? "" : "s"}`);
  if (rateCount > 0) bodyLines.push(`${rateCount} rate edit${rateCount === 1 ? "" : "s"}`);
  bodyLines.push(`Supplier: ${opts.supplierName}`);
  for (const l of flagged.slice(0, 5)) {
    const name = nameById.get(l.rawMaterialId) ?? "item";
    if (l.offCard) {
      bodyLines.push(`• ${name}: off-card @ ₹${l.unitPrice} — ${l.rateChangeReason ?? ""}`);
    } else {
      bodyLines.push(
        `• ${name}: ₹${l.rateChangedFrom} → ₹${l.unitPrice} — ${l.rateChangeReason ?? ""}`
      );
    }
  }
  if (flagged.length > 5) bodyLines.push(`…and ${flagged.length - 5} more.`);
  await db.notification.create({
    data: {
      outletId: opts.outletId,
      kind: "WARNING",
      title,
      body: bodyLines.join("\n"),
      link: `/inventory/purchase/${opts.poId}`,
    },
  });
}

/**
 * Create a PO. By default lands in DRAFT — the SM revises and then submits
 * to the CC. Pass `submitForApproval: true` to skip the draft step entirely
 * and move straight to PENDING_CC_APPROVAL (or APPROVED when the CC gate
 * is off).
 */
export async function createPO(
  input: z.infer<typeof POInput>
): Promise<{ id: string; poNo: string; status: string }> {
  const user = await requireUser();
  const data = POInput.parse(input);
  const outlet = await getActiveOutlet();
  const store = await getStoreDept(outlet.id);
  const sub = data.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const tax = 0; // simplification — line-level tax computed at GRN time
  const grand = Math.round(sub + tax);
  const poNo = await nextPoNo(outlet.id, outlet.code);

  // If the SM picked a requisition, validate it belongs to this outlet and
  // is in a state where chasing a PO makes sense (APPROVED / PARTIAL — the
  // store is short and needs vendor goods to fulfil).
  if (data.requisitionId) {
    const req = await db.requisition.findFirst({
      where: { id: data.requisitionId, outletId: outlet.id },
      select: { id: true, status: true, reqNo: true },
    });
    if (!req) throw new Error("Requisition not found at this outlet");
    if (!["APPROVED", "PARTIAL", "NEW"].includes(req.status)) {
      throw new Error(
        `Cannot raise PO against a ${req.status} requisition — only APPROVED / PARTIAL / NEW`
      );
    }
  }

  const po = await db.purchaseOrder.create({
    data: {
      poNo,
      supplierId: data.supplierId,
      outletId: outlet.id,
      departmentId: store.id,
      requisitionId: data.requisitionId,
      status: "DRAFT",
      subTotal: sub,
      taxTotal: tax,
      grandTotal: grand,
      notes: data.notes,
      lines: {
        create: data.lines.map((l) => ({
          rawMaterialId: l.rawMaterialId,
          qty: l.qty,
          unit: l.unit,
          unitPrice: l.unitPrice,
          lineTotal: l.qty * l.unitPrice,
          offCard: l.offCard,
          rateChangedFrom: l.rateChangedFrom,
          rateChangeReason: l.rateChangeReason,
        })),
      },
    },
    include: { supplier: { select: { name: true } } },
  });

  await logActivity({
    action: "CREATE",
    entity: "RawMaterial",
    entityId: po.id,
    summary: data.requisitionId
      ? `PO ${poNo} drafted for ${inr(grand)} against requisition shortfall`
      : `PO ${poNo} drafted for ${inr(grand)}`,
    outletId: outlet.id,
  });

  await alertOnRateCardDeviations({
    outletId: outlet.id,
    poId: po.id,
    poNo,
    supplierName: po.supplier.name,
    lines: data.lines,
  });

  // Optional one-shot: skip the DRAFT step and submit for CC approval.
  // Mirrors submitPO without the FormData / lookup round-trip.
  let finalStatus = "DRAFT";
  if (data.submitForApproval) {
    const requiresCC = (outlet as any).requireCostControlApproval ?? true;
    finalStatus = requiresCC ? "PENDING_CC_APPROVAL" : "APPROVED";
    await db.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: finalStatus,
        ccApprovedById: requiresCC ? null : user.id,
        ccApprovedAt: requiresCC ? null : new Date(),
      },
    });
    await logActivity({
      action: "UPDATE",
      entity: "RawMaterial",
      entityId: po.id,
      summary: requiresCC
        ? `PO ${poNo} submitted for cost-control approval`
        : `PO ${poNo} auto-approved (CC gate off)`,
      outletId: outlet.id,
    });
    if (requiresCC) {
      await db.notification.create({
        data: {
          outletId: outlet.id,
          kind: "INFO",
          title: `PO ${poNo} awaiting CC approval`,
          body: `${inr(grand)} from supplier — open to review.`,
          link: `/inventory/purchase/${po.id}`,
        },
      });
    }
  }

  revalidatePath("/inventory/purchase");
  return { id: po.id, poNo, status: finalStatus };
}

/**
 * Edit a DRAFT PO. Allowed only while status === "DRAFT" — once it's been
 * sent for approval, the SM can't tweak lines or supplier any more (use
 * cancel + new PO if a change is needed at that stage).
 *
 * Replaces all lines wholesale (delete + recreate) so the SM can add,
 * remove, or change qty/price in a single round-trip without us needing
 * to diff. Totals are recomputed.
 */
const POUpdateInput = z.object({
  id: z.string(),
  supplierId: z.string(),
  notes: z.string().optional(),
  lines: z.array(LineInput).min(1),
  /** Same as createPO — pick "Save as draft" or "Save + submit for approval". */
  submitForApproval: z.boolean().default(false),
});

export async function updatePO(
  input: z.infer<typeof POUpdateInput>
): Promise<{ id: string; poNo: string; status: string }> {
  const user = await requireUser();
  const data = POUpdateInput.parse(input);
  const outlet = await getActiveOutlet();
  const existing = await db.purchaseOrder.findFirst({
    where: { id: data.id, outletId: outlet.id },
    select: { id: true, poNo: true, status: true },
  });
  if (!existing) throw new Error("PO not found at this outlet");
  if (existing.status !== "DRAFT") {
    throw new Error(
      `PO ${existing.poNo} is ${existing.status} — only DRAFT purchase orders can be edited`
    );
  }

  const sub = data.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const tax = 0;
  const grand = Math.round(sub + tax);

  await db.$transaction([
    db.purchaseOrderLine.deleteMany({ where: { poId: data.id } }),
    db.purchaseOrder.update({
      where: { id: data.id },
      data: {
        supplierId: data.supplierId,
        notes: data.notes,
        subTotal: sub,
        taxTotal: tax,
        grandTotal: grand,
        lines: {
          create: data.lines.map((l) => ({
            rawMaterialId: l.rawMaterialId,
            qty: l.qty,
            unit: l.unit,
            unitPrice: l.unitPrice,
            lineTotal: l.qty * l.unitPrice,
            offCard: l.offCard,
            rateChangedFrom: l.rateChangedFrom,
            rateChangeReason: l.rateChangeReason,
          })),
        },
      },
    }),
  ]);

  await logActivity({
    action: "UPDATE",
    entity: "RawMaterial",
    entityId: data.id,
    summary: `PO ${existing.poNo} draft revised — ${data.lines.length} line(s), ${inr(grand)}`,
    outletId: outlet.id,
  });

  const supplierForAlert = await db.supplier.findUnique({
    where: { id: data.supplierId },
    select: { name: true },
  });
  await alertOnRateCardDeviations({
    outletId: outlet.id,
    poId: data.id,
    poNo: existing.poNo,
    supplierName: supplierForAlert?.name ?? "supplier",
    lines: data.lines,
  });

  // Optional one-shot submit on save (same path as createPO).
  let finalStatus = "DRAFT";
  if (data.submitForApproval) {
    const requiresCC = (outlet as any).requireCostControlApproval ?? true;
    finalStatus = requiresCC ? "PENDING_CC_APPROVAL" : "APPROVED";
    await db.purchaseOrder.update({
      where: { id: data.id },
      data: {
        status: finalStatus,
        ccApprovedById: requiresCC ? null : user.id,
        ccApprovedAt: requiresCC ? null : new Date(),
      },
    });
    await logActivity({
      action: "UPDATE",
      entity: "RawMaterial",
      entityId: data.id,
      summary: requiresCC
        ? `PO ${existing.poNo} submitted for cost-control approval`
        : `PO ${existing.poNo} auto-approved (CC gate off)`,
      outletId: outlet.id,
    });
    if (requiresCC) {
      await db.notification.create({
        data: {
          outletId: outlet.id,
          kind: "INFO",
          title: `PO ${existing.poNo} awaiting CC approval`,
          body: `${inr(grand)} from supplier — open to review.`,
          link: `/inventory/purchase/${data.id}`,
        },
      });
    }
  }

  revalidatePath("/inventory/purchase");
  revalidatePath(`/inventory/purchase/${data.id}`);
  return { id: data.id, poNo: existing.poNo, status: finalStatus };
}

/**
 * SM submits a DRAFT PO. If the outlet's `requireCostControlApproval` flag
 * is on, the PO sits in PENDING_CC_APPROVAL waiting for a CC to act.
 * Otherwise we skip the gate and promote straight to APPROVED.
 */
export async function submitPO(fd: FormData) {
  const user = await requireUser();
  const id = String(fd.get("id") ?? "");
  if (!id) throw new Error("PO id is required");
  const outlet = await getActiveOutlet();
  const po = await db.purchaseOrder.findFirst({ where: { id, outletId: outlet.id } });
  if (!po) throw new Error("PO not found");
  if (po.status !== "DRAFT") throw new Error(`Cannot submit a ${po.status} PO`);

  const requiresCC = (outlet as any).requireCostControlApproval ?? true;
  const nextStatus = requiresCC ? "PENDING_CC_APPROVAL" : "APPROVED";

  await db.purchaseOrder.update({
    where: { id },
    data: {
      status: nextStatus,
      // When skipping the CC gate, capture the auto-approval against the
      // submitter so the audit trail isn't a black hole.
      ccApprovedById: requiresCC ? null : user.id,
      ccApprovedAt: requiresCC ? null : new Date(),
    },
  });

  await logActivity({
    action: "UPDATE",
    entity: "RawMaterial",
    entityId: id,
    summary: requiresCC
      ? `PO ${po.poNo} submitted for cost-control approval`
      : `PO ${po.poNo} auto-approved (CC gate off)`,
    outletId: outlet.id,
  });

  // Notify the CC team if approval is required.
  if (requiresCC) {
    await db.notification.create({
      data: {
        outletId: outlet.id,
        kind: "INFO",
        title: `PO ${po.poNo} awaiting CC approval`,
        body: `${inr(po.grandTotal)} from supplier — open to review.`,
        link: `/inventory/purchase/${id}`,
      },
    });
  }

  revalidatePath("/inventory/purchase");
  revalidatePath(`/inventory/purchase/${id}`);
}

/** Cost Controller approves a pending PO. */
export async function ccApprovePO(fd: FormData) {
  const user = await requireUser();
  if (!canAccess(user.role, "inventory.purchase.approve")) {
    throw new Error("Only a Cost Controller can approve POs");
  }
  const id = String(fd.get("id") ?? "");
  const outlet = await getActiveOutlet();
  const po = await db.purchaseOrder.findFirst({ where: { id, outletId: outlet.id } });
  if (!po) throw new Error("PO not found");
  if (po.status !== "PENDING_CC_APPROVAL") {
    throw new Error(`PO is in status ${po.status} — cannot approve`);
  }
  await db.purchaseOrder.update({
    where: { id },
    data: { status: "APPROVED", ccApprovedById: user.id, ccApprovedAt: new Date() },
  });
  await logActivity({
    action: "ACCEPT",
    entity: "RawMaterial",
    entityId: id,
    summary: `PO ${po.poNo} approved by Cost Controller`,
    outletId: outlet.id,
  });
  revalidatePath("/inventory/purchase");
  revalidatePath(`/inventory/purchase/${id}`);
}

/** Cost Controller rejects a pending PO with mandatory reason. */
export async function ccRejectPO(fd: FormData) {
  const user = await requireUser();
  if (!canAccess(user.role, "inventory.purchase.approve")) {
    throw new Error("Only a Cost Controller can reject POs");
  }
  const id = String(fd.get("id") ?? "");
  const reason = String(fd.get("reason") ?? "").trim();
  if (reason.length < 3) throw new Error("A rejection reason is required");
  const outlet = await getActiveOutlet();
  const po = await db.purchaseOrder.findFirst({ where: { id, outletId: outlet.id } });
  if (!po) throw new Error("PO not found");
  if (po.status !== "PENDING_CC_APPROVAL") {
    throw new Error(`PO is in status ${po.status} — cannot reject`);
  }
  await db.purchaseOrder.update({
    where: { id },
    data: {
      status: "REJECTED",
      ccApprovedById: user.id,
      ccApprovedAt: new Date(),
      ccRejectionReason: reason,
    },
  });
  await logActivity({
    action: "REJECT",
    entity: "RawMaterial",
    entityId: id,
    summary: `PO ${po.poNo} rejected by Cost Controller: ${reason}`,
    outletId: outlet.id,
  });
  revalidatePath("/inventory/purchase");
  revalidatePath(`/inventory/purchase/${id}`);
}

/** Mark an APPROVED PO as SENT to the vendor (download / email step done out-of-band). */
export async function markSent(fd: FormData) {
  await requireUser();
  const id = String(fd.get("id"));
  const outlet = await getActiveOutlet();
  const po = await db.purchaseOrder.findFirst({ where: { id, outletId: outlet.id } });
  if (!po) throw new Error("PO not found");
  if (po.status !== "APPROVED") throw new Error(`Can only send an APPROVED PO (this one is ${po.status})`);
  await db.purchaseOrder.update({ where: { id }, data: { status: "SENT" } });
  await logActivity({
    action: "UPDATE",
    entity: "RawMaterial",
    entityId: id,
    summary: `PO ${po.poNo} sent to supplier`,
    outletId: po.outletId,
  });
  revalidatePath("/inventory/purchase");
  revalidatePath(`/inventory/purchase/${id}`);
}

export async function cancelPO(fd: FormData) {
  await requireUser();
  const id = String(fd.get("id"));
  const po = await db.purchaseOrder.findUnique({ where: { id } });
  if (!po) return;
  if (po.status === "CLOSED" || po.status === "PARTIALLY_RECEIVED") {
    throw new Error("Cannot cancel a PO once goods have started arriving");
  }
  await db.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED" } });
  await logActivity({
    action: "CANCEL",
    entity: "RawMaterial",
    entityId: id,
    summary: `PO ${po.poNo} cancelled`,
    outletId: po.outletId,
  });
  revalidatePath("/inventory/purchase");
  revalidatePath(`/inventory/purchase/${id}`);
}

/**
 * LEGACY shim: the old direct-receive flow that mutated stock from the PO
 * page is gone — stock moves now happen at GRN save. This action redirects
 * to the New GRN form against this PO so the legacy "Receive" button on
 * old screens keeps working.
 */
export async function receivePO(fd: FormData) {
  await requireUser();
  const id = String(fd.get("id"));
  redirect(`/inventory/grn/new?po=${encodeURIComponent(id)}`);
}

/**
 * Multi-supplier auto-PO — spec section 2.
 *
 * One submit can carry items from multiple suppliers. The server groups
 * the lines by supplierId, then creates one DRAFT PO per supplier. Every
 * PO in the batch shares the same `batchKey` so the list view can show
 * "3 drafts from this auto-PO" and the SM can review each before sending
 * for CC approval.
 *
 * Returns the list of created POs so the client can route to the list
 * page with a banner.
 */
export async function createAutoPosByGrouping(
  input: z.infer<typeof AutoPOInput>
): Promise<{ batchKey: string; pos: { id: string; poNo: string; supplierName: string; lines: number; total: number }[] }> {
  const user = await requireUser();
  const data = AutoPOInput.parse(input);
  const outlet = await getActiveOutlet();
  const store = await getStoreDept(outlet.id);

  // Group lines by supplier.
  const bySupplier = new Map<string, typeof data.lines>();
  for (const l of data.lines) {
    const arr = bySupplier.get(l.supplierId) ?? [];
    arr.push(l);
    bySupplier.set(l.supplierId, arr);
  }

  // Deterministic batchKey — readable in the audit log + URL params.
  const batchKey = `BATCH-${outlet.code}-${Date.now().toString(36).toUpperCase()}`;

  const created: { id: string; poNo: string; supplierName: string; lines: number; total: number }[] = [];

  for (const [supplierId, lines] of bySupplier) {
    const supplier = await db.supplier.findUnique({
      where: { id: supplierId },
      select: { name: true },
    });
    if (!supplier) throw new Error(`Supplier not found: ${supplierId}`);

    const sub = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const grand = Math.round(sub);
    const poNo = await nextPoNo(outlet.id, outlet.code);

    const po = await db.purchaseOrder.create({
      data: {
        poNo,
        supplierId,
        outletId: outlet.id,
        departmentId: store.id,
        status: "DRAFT",
        subTotal: sub,
        taxTotal: 0,
        grandTotal: grand,
        notes: data.notes,
        batchKey,
        lines: {
          create: lines.map((l) => ({
            rawMaterialId: l.rawMaterialId,
            qty: l.qty,
            unit: l.unit,
            unitPrice: l.unitPrice,
            lineTotal: l.qty * l.unitPrice,
            offCard: l.offCard,
          })),
        },
      },
    });

    created.push({
      id: po.id,
      poNo,
      supplierName: supplier.name,
      lines: lines.length,
      total: grand,
    });
  }

  await logActivity({
    action: "CREATE",
    entity: "RawMaterial",
    entityId: batchKey,
    summary: `Auto-PO ${batchKey} — ${created.length} draft PO${
      created.length === 1 ? "" : "s"
    } across ${created.length} supplier${created.length === 1 ? "" : "s"} · total ${inr(
      created.reduce((s, p) => s + p.total, 0)
    )}`,
    outletId: outlet.id,
  });

  revalidatePath("/inventory/purchase");
  return { batchKey, pos: created };
}
