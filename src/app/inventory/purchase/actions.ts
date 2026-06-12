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
});

const POInput = z.object({
  supplierId: z.string(),
  notes: z.string().optional(),
  lines: z.array(LineInput).min(1),
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
 * Create a PO. Lands in DRAFT — the SM needs to explicitly submit it to
 * the CC for approval (or directly to SENT when CC gate is off).
 */
export async function createPO(input: z.infer<typeof POInput>): Promise<{ id: string; poNo: string }> {
  await requireUser();
  const data = POInput.parse(input);
  const outlet = await getActiveOutlet();
  const store = await getStoreDept(outlet.id);
  const sub = data.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const tax = 0; // simplification — line-level tax computed at GRN time
  const grand = Math.round(sub + tax);
  const poNo = await nextPoNo(outlet.id, outlet.code);

  const po = await db.purchaseOrder.create({
    data: {
      poNo,
      supplierId: data.supplierId,
      outletId: outlet.id,
      departmentId: store.id,
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
        })),
      },
    },
  });

  await logActivity({
    action: "CREATE",
    entity: "RawMaterial",
    entityId: po.id,
    summary: `PO ${poNo} drafted for ${inr(grand)}`,
    outletId: outlet.id,
  });

  revalidatePath("/inventory/purchase");
  return { id: po.id, poNo };
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
