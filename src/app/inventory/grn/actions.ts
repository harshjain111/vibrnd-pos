"use server";
/**
 * Goods Receipt Note (GRN) service.
 *
 * The GRN is THE source-of-truth document for stock incoming from a vendor.
 * Stock moves on GRN save — never on PO close. One PO can have many GRNs
 * (partial deliveries). A GRN can also be created standalone (no PO) for
 * emergency local purchases — those flash a warning banner + ping the
 * manager so the audit trail is loud.
 *
 * On save:
 *  1. Increments PO line `qtyReceived` (if linked) and rolls the PO status
 *     to PARTIALLY_RECEIVED → CLOSED when all qty is in.
 *  2. Updates RawMaterial.avgCost via weighted-average roll-forward.
 *  3. Writes a positive StockMovement at the STORE department for each
 *     line — this is the ONLY moment stock changes for a purchase.
 *  4. Audit-log + (for ad-hoc) notifies the manager.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { logActivity } from "@/lib/audit";
import { moveStock } from "@/lib/stock";
import { inr } from "@/lib/utils";

const LineInput = z.object({
  poLineId: z.string().optional(),
  rawMaterialId: z.string(),
  qtyReceived: z.coerce.number().nonnegative(),
  qtyDamaged: z.coerce.number().nonnegative().default(0),
  qtyShort: z.coerce.number().nonnegative().default(0),
  unit: z.string().min(1),
  unitCost: z.coerce.number().nonnegative(),
  batchNo: z.string().optional(),
  expiryDate: z.string().optional(),
  note: z.string().optional(),
});

const CreateInput = z.object({
  poId: z.string().optional(),
  /** Required when poId is null — vendor for the ad-hoc receipt's stock
   *  context (so the manager notification can reference it). */
  supplierId: z.string().optional(),
  receivedAt: z.string().optional(),
  notes: z.string().optional(),
  /** When true, this is a partial delivery — keep the GRN OPEN so the
   *  vendor can drop more later under the same doc. Defaults false. */
  keepOpen: z.boolean().default(false),
  lines: z.array(LineInput).min(1, "At least one line is required"),
});

async function nextGrnNo(outletId: string, outletCode: string) {
  const count = await db.grn.count({ where: { outletId } });
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `GRN-${outletCode}-${String(count + 1 + attempt).padStart(6, "0")}`;
    const clash = await db.grn.findUnique({ where: { grnNo: candidate } });
    if (!clash) return candidate;
  }
  throw new Error("Could not allocate a GRN number");
}

async function getStoreDept(outletId: string) {
  const store = await db.department.findFirst({
    where: { outletId, kind: "STORE", active: true },
    orderBy: { createdAt: "asc" },
  });
  if (!store) throw new Error("No STORE department for this outlet");
  return store;
}

export type CreateGrnResult = { ok: true; id: string } | { ok: false; error: string };

export async function createGrn(input: z.infer<typeof CreateInput>): Promise<CreateGrnResult> {
  try {
    return await createGrnInner(input);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function createGrnInner(input: z.infer<typeof CreateInput>): Promise<CreateGrnResult> {
  const user = await requireUser();
  const outlet = await getActiveOutlet();
  const data = CreateInput.parse(input);
  const store = await getStoreDept(outlet.id);

  // PO context if linked
  const po = data.poId
    ? await db.purchaseOrder.findFirst({
        where: { id: data.poId, outletId: outlet.id },
        include: { lines: true },
      })
    : null;
  if (data.poId && !po) throw new Error("PO not found");
  if (po && !["APPROVED", "SENT", "PARTIALLY_RECEIVED"].includes(po.status)) {
    throw new Error(`Cannot receive against a PO in status ${po.status}`);
  }
  // If the SM is receiving goods against an APPROVED PO, they implicitly
  // sent it — auto-promote so the state machine stays consistent. (Picker
  // surfaces APPROVED on purpose for the common "skip the Mark-Sent step"
  // path.)
  if (po && po.status === "APPROVED") {
    await db.purchaseOrder.update({
      where: { id: po.id },
      data: { status: "SENT" },
    });
  }

  // Drop zero-receive lines — they're just noise.
  const lines = data.lines.filter((l) => l.qtyReceived > 0 || l.qtyDamaged > 0 || l.qtyShort > 0);
  if (lines.length === 0) throw new Error("Nothing received — every line is zero");

  const isAdHoc = !data.poId;
  const grnNo = await nextGrnNo(outlet.id, outlet.code);
  const totalReceived = lines.reduce((s, l) => s + l.qtyReceived * l.unitCost, 0);

  const grn = await db.grn.create({
    data: {
      grnNo,
      poId: data.poId ?? null,
      isAdHoc,
      outletId: outlet.id,
      departmentId: store.id,
      receivedById: user.id,
      receivedAt: data.receivedAt ? new Date(data.receivedAt) : new Date(),
      status: data.keepOpen ? "OPEN" : "CLOSED",
      notes: data.notes,
      lines: {
        create: lines.map((l) => ({
          poLineId: l.poLineId ?? null,
          rawMaterialId: l.rawMaterialId,
          qtyReceived: l.qtyReceived,
          qtyDamaged: l.qtyDamaged ?? 0,
          qtyShort: l.qtyShort ?? 0,
          unit: l.unit,
          unitCost: l.unitCost,
          batchNo: l.batchNo,
          expiryDate: l.expiryDate ? new Date(l.expiryDate) : null,
          note: l.note,
        })),
      },
    },
    include: { lines: true },
  });

  // Stock movement + avg-cost roll-forward per line.
  for (const l of lines) {
    if (l.qtyReceived <= 0) continue;
    const rm = await db.rawMaterial.findUnique({ where: { id: l.rawMaterialId } });
    if (!rm) continue;
    // Weighted-average cost = (oldQty*oldCost + newQty*newCost) / (oldQty + newQty)
    const newQty = rm.currentQty + l.qtyReceived;
    const newAvgCost =
      newQty > 0 ? (rm.currentQty * rm.avgCost + l.qtyReceived * l.unitCost) / newQty : l.unitCost;
    await db.rawMaterial.update({
      where: { id: rm.id },
      data: { avgCost: newAvgCost },
    });
    await moveStock({
      rawMaterialId: l.rawMaterialId,
      delta: l.qtyReceived,
      reason: "GRN_RECEIPT",
      refType: "Grn",
      refId: grn.id,
      departmentId: store.id,
      note: po ? `Against ${po.poNo} via ${grnNo}` : `Ad-hoc receipt via ${grnNo}`,
    });
  }

  // Roll PO line qtyReceived + maybe close the PO.
  if (po) {
    for (const l of lines) {
      if (l.poLineId && l.qtyReceived > 0) {
        await db.purchaseOrderLine.update({
          where: { id: l.poLineId },
          data: { qtyReceived: { increment: l.qtyReceived } },
        });
      }
    }
    const refreshed = await db.purchaseOrder.findUnique({
      where: { id: po.id },
      include: { lines: true },
    });
    if (refreshed) {
      const allDone = refreshed.lines.every((pl) => pl.qtyReceived >= pl.qty);
      const someDone = refreshed.lines.some((pl) => pl.qtyReceived > 0);
      let nextPoStatus: string | null = null;
      if (allDone && !data.keepOpen) nextPoStatus = "CLOSED";
      else if (someDone) nextPoStatus = "PARTIALLY_RECEIVED";
      if (nextPoStatus && nextPoStatus !== refreshed.status) {
        await db.purchaseOrder.update({
          where: { id: po.id },
          data: {
            status: nextPoStatus,
            receivedAt: nextPoStatus === "CLOSED" ? new Date() : refreshed.receivedAt,
          },
        });
      }
    }
  }

  await logActivity({
    action: "CREATE",
    entity: "RawMaterial",
    entityId: grn.id,
    summary: `${isAdHoc ? "Ad-hoc " : ""}GRN ${grnNo} received — ${lines.length} line(s) · ${inr(Math.round(totalReceived))}`,
    outletId: outlet.id,
  });

  // For ad-hoc GRNs, ping the manager so they know stock came in outside
  // the normal PO flow.
  if (isAdHoc) {
    await db.notification.create({
      data: {
        outletId: outlet.id,
        kind: "INFO",
        title: `Ad-hoc receipt ${grnNo}`,
        body: `Stock received without a PO. ${lines.length} line(s) · ${inr(Math.round(totalReceived))}.`,
        link: `/inventory/grn/${grn.id}`,
      },
    });
  }

  revalidatePath("/inventory/grn");
  revalidatePath("/inventory");
  revalidatePath("/inventory/available");
  if (po) revalidatePath(`/inventory/purchase/${po.id}`);
  return { ok: true, id: grn.id };
}

/** Close an OPEN GRN — used when the vendor confirms there will be no
 *  further deliveries against this doc. */
export async function closeGrn(fd: FormData) {
  await requireUser();
  const id = String(fd.get("id"));
  const outlet = await getActiveOutlet();
  const grn = await db.grn.findFirst({ where: { id, outletId: outlet.id } });
  if (!grn) throw new Error("GRN not found");
  if (grn.status !== "OPEN") throw new Error(`GRN already ${grn.status}`);
  await db.grn.update({ where: { id }, data: { status: "CLOSED" } });
  await logActivity({
    action: "UPDATE",
    entity: "RawMaterial",
    entityId: id,
    summary: `GRN ${grn.grnNo} closed`,
    outletId: outlet.id,
  });
  revalidatePath("/inventory/grn");
  revalidatePath(`/inventory/grn/${id}`);
}
