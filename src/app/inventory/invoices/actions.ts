"use server";
/**
 * Vendor Invoice + Payment AP chain.
 *
 * One invoice can span multiple GRNs (vendor batches deliveries into one
 * bill); one GRN can be referenced by multiple invoices. We model this with
 * the VendorInvoiceGrnLink bridge.
 *
 * Lines are captured manually so the accountant can reconcile against what
 * the vendor actually billed. Server enforces qty ≤ (cumulative PO line qty
 * across linked POs) − (already invoiced elsewhere against those POs) so a
 * vendor that bills the full PO before all GRNs are punched still works
 * without letting the same units slip into two invoices.
 *
 * Payments allocate against a VendorInvoice (preferred) but the legacy
 * VendorPayment table can still point at a Purchase row for back-compat.
 * Payment status on the invoice rolls from UNPAID → PARTIAL → PAID
 * automatically based on sum(amountPaid).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { logActivity } from "@/lib/audit";
import { inr } from "@/lib/utils";

const LineInput = z.object({
  rawMaterialId: z.string(),
  description: z.string().optional(),
  qty: z.coerce.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.coerce.number().nonnegative(),
  taxRate: z.coerce.number().nonnegative().default(0),
});

const CreateInput = z.object({
  supplierId: z.string(),
  invoiceNo: z.string().min(1),
  invoiceDate: z.string(),
  /** Path to the uploaded invoice file in Supabase Storage. Optional. */
  fileUrl: z.string().optional(),
  notes: z.string().optional(),
  /** Vendor's stated invoice amount (the headline number on their bill).
   *  Compared against expectedAmount (sum of selected GRNs' landedTotal)
   *  to decide whether the invoice goes straight to MATCHED or routes
   *  through the CC variance review (DISPUTED). When omitted, falls back
   *  to grandTotal computed from lines. */
  invoiceAmount: z.coerce.number().nonnegative().optional(),
  /** Purchase Order this stock purchase is raised against. Preferred path —
   *  selecting the PO pulls in the supplier + lines and bounds qty against
   *  the order. Stock itself moves on GRN, not here. */
  poId: z.string().optional(),
  /** Legacy GRN linkage. Optional now — only used by the old GRN-first flow. */
  grnLinks: z
    .array(z.object({ grnId: z.string(), amount: z.coerce.number().nonnegative().default(0) }))
    .optional()
    .default([]),
  /** Per-item lines captured from the vendor's bill. Drives sub/tax/grand. */
  lines: z.array(LineInput).min(1),
});

/// Variance tolerance (₹). Differences smaller than this round to zero —
/// avoids routing rounding noise through the CC queue.
const VARIANCE_TOLERANCE = 1;

export async function createVendorInvoice(
  input: z.input<typeof CreateInput>
): Promise<{ id: string }> {
  const user = await requireUser();
  const data = CreateInput.parse(input);
  const outlet = await getActiveOutlet();

  const draftByRm = new Map<string, number>();
  for (const l of data.lines) {
    draftByRm.set(l.rawMaterialId, (draftByRm.get(l.rawMaterialId) ?? 0) + l.qty);
  }
  const rmNames = new Map(
    (
      await db.rawMaterial.findMany({
        where: { id: { in: Array.from(draftByRm.keys()) }, outletId: outlet.id },
        select: { id: true, name: true },
      })
    ).map((r) => [r.id, r.name])
  );

  if (data.poId) {
    // ── PO-first flow ───────────────────────────────────────────────────
    // Validate the PO, bound each line against (ordered − already invoiced
    // against this PO), and stamp the link. No GRN needed.
    const po = await db.purchaseOrder.findFirst({
      where: { id: data.poId, outletId: outlet.id },
      include: { lines: { select: { rawMaterialId: true, qty: true } } },
    });
    if (!po) throw new Error("Purchase order not found at this outlet");
    if (po.supplierId !== data.supplierId) {
      throw new Error("PO supplier doesn't match the stock-purchase supplier");
    }

    const orderedByRm = new Map<string, number>();
    for (const l of po.lines) {
      orderedByRm.set(l.rawMaterialId, (orderedByRm.get(l.rawMaterialId) ?? 0) + l.qty);
    }
    const priorInvoices = await db.vendorInvoice.findMany({
      where: { outletId: outlet.id, poId: po.id },
      select: { lines: { select: { rawMaterialId: true, qty: true } } },
    });
    const invoicedByRm = new Map<string, number>();
    for (const inv of priorInvoices) {
      for (const l of inv.lines) {
        invoicedByRm.set(l.rawMaterialId, (invoicedByRm.get(l.rawMaterialId) ?? 0) + l.qty);
      }
    }
    for (const [rmId, draftQty] of draftByRm) {
      const ordered = orderedByRm.get(rmId);
      if (ordered === undefined) {
        throw new Error(`${rmNames.get(rmId) ?? "Item"} isn't on this PO — can't bill it here`);
      }
      const already = invoicedByRm.get(rmId) ?? 0;
      const available = ordered - already;
      if (draftQty > available + 0.001) {
        throw new Error(
          `${rmNames.get(rmId) ?? "Item"}: billed qty ${draftQty} exceeds remaining PO budget ${available.toFixed(
            2
          )} (ordered ${ordered}, already billed ${already})`
        );
      }
    }
  } else if (data.grnLinks.length > 0) {
    // ── Legacy GRN-first flow (kept for back-compat) ────────────────────
    const grns = await db.grn.findMany({
      where: { id: { in: data.grnLinks.map((l) => l.grnId) }, outletId: outlet.id },
      include: { po: { select: { id: true, supplierId: true } } },
    });
    if (grns.length !== data.grnLinks.length) throw new Error("One or more GRNs not found");
    for (const g of grns) {
      if (g.po && g.po.supplierId !== data.supplierId) {
        throw new Error("GRN supplier doesn't match invoice supplier");
      }
    }
    const linkedPoIds = Array.from(new Set(grns.map((g) => g.poId).filter(Boolean) as string[]));
    if (linkedPoIds.length > 0) {
      const poLines = await db.purchaseOrderLine.findMany({
        where: { poId: { in: linkedPoIds } },
        select: { rawMaterialId: true, qty: true },
      });
      const orderedByRm = new Map<string, number>();
      for (const l of poLines) {
        orderedByRm.set(l.rawMaterialId, (orderedByRm.get(l.rawMaterialId) ?? 0) + l.qty);
      }
      const siblingGrns = await db.grn.findMany({
        where: { poId: { in: linkedPoIds } },
        select: { id: true },
      });
      const siblingGrnIds = siblingGrns.map((g) => g.id);
      const priorInvoices = await db.vendorInvoice.findMany({
        where: {
          outletId: outlet.id,
          supplierId: data.supplierId,
          grnLinks: { some: { grnId: { in: siblingGrnIds } } },
        },
        select: { lines: { select: { rawMaterialId: true, qty: true } } },
      });
      const invoicedByRm = new Map<string, number>();
      for (const inv of priorInvoices) {
        for (const l of inv.lines) {
          invoicedByRm.set(l.rawMaterialId, (invoicedByRm.get(l.rawMaterialId) ?? 0) + l.qty);
        }
      }
      for (const [rmId, draftQty] of draftByRm) {
        const ordered = orderedByRm.get(rmId);
        if (ordered === undefined) {
          throw new Error(
            `${rmNames.get(rmId) ?? "Item"} isn't on any of the linked POs — can't invoice it here`
          );
        }
        const already = invoicedByRm.get(rmId) ?? 0;
        const available = ordered - already;
        if (draftQty > available + 0.001) {
          throw new Error(
            `${rmNames.get(rmId) ?? "Item"}: invoiced qty ${draftQty} exceeds remaining PO budget ${available.toFixed(
              2
            )} (ordered ${ordered}, already invoiced ${already})`
          );
        }
      }
    }
  } else {
    throw new Error("Select a purchase order (or link a GRN) for this stock purchase");
  }

  // Compute line totals + roll the invoice header.
  const lines = data.lines.map((l) => {
    const lineSubTotal = round2(l.qty * l.unitPrice);
    const lineTax = round2((lineSubTotal * l.taxRate) / 100);
    const lineTotal = round2(lineSubTotal + lineTax);
    return {
      rawMaterialId: l.rawMaterialId,
      description: l.description,
      qty: l.qty,
      unit: l.unit,
      unitPrice: l.unitPrice,
      taxRate: l.taxRate,
      lineSubTotal,
      lineTax,
      lineTotal,
    };
  });
  const subTotal = round2(lines.reduce((s, l) => s + l.lineSubTotal, 0));
  const taxTotal = round2(lines.reduce((s, l) => s + l.lineTax, 0));
  const grandTotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));

  // Auto-split grandTotal across any linked GRNs (legacy path only).
  let links: { grnId: string; amount: number }[] = [];
  if (data.grnLinks.length > 0) {
    const explicit = data.grnLinks.filter((l) => l.amount > 0);
    if (explicit.length === 0) {
      const per = round2(grandTotal / data.grnLinks.length);
      links = data.grnLinks.map((l, i) => ({
        grnId: l.grnId,
        amount:
          i === data.grnLinks.length - 1
            ? round2(grandTotal - per * (data.grnLinks.length - 1))
            : per,
      }));
    } else {
      links = data.grnLinks.map((l) => ({ grnId: l.grnId, amount: l.amount }));
    }
  }

  // ── Variance computation (spec section 5) ──────────────────────────
  // expectedAmount = sum of landedTotal across the GRNs this invoice
  // references. When linked via legacy grnLinks we use those rows; for
  // the PO-first flow we infer the GRNs from the PO. The vendor's
  // stated amount is invoiceAmount (or grandTotal as fallback when the
  // form doesn't pass it). variance = invoiceAmount − expectedAmount.
  let expectedAmount = 0;
  if (data.grnLinks.length > 0) {
    const grnTotals = await db.grn.findMany({
      where: { id: { in: data.grnLinks.map((l) => l.grnId) }, outletId: outlet.id },
      select: { landedTotal: true },
    });
    expectedAmount = grnTotals.reduce((s, g) => s + (g.landedTotal || 0), 0);
  } else if (data.poId) {
    const poGrns = await db.grn.findMany({
      where: { poId: data.poId, outletId: outlet.id },
      select: { landedTotal: true },
    });
    expectedAmount = poGrns.reduce((s, g) => s + (g.landedTotal || 0), 0);
  }
  expectedAmount = round2(expectedAmount);
  const invoiceAmount = round2(data.invoiceAmount ?? grandTotal);
  const rawVariance = round2(invoiceAmount - expectedAmount);
  const variance = Math.abs(rawVariance) < VARIANCE_TOLERANCE ? 0 : rawVariance;
  // Auto-route per spec:
  //   variance ≤ 0 (vendor billed ≤ expected) → MATCHED (accountant verifies)
  //   variance > 0 (vendor billed more) → DISPUTED (CC reviews)
  const reviewStatus = variance > 0 ? "DISPUTED" : "MATCHED";

  const invoice = await db.vendorInvoice.create({
    data: {
      supplierId: data.supplierId,
      invoiceNo: data.invoiceNo.trim(),
      invoiceDate: new Date(data.invoiceDate),
      poId: data.poId ?? null,
      outletId: outlet.id,
      subTotal,
      taxTotal,
      grandTotal,
      invoiceAmount,
      expectedAmount,
      variance,
      reviewStatus,
      status: "UNPAID",
      amountPaid: 0,
      fileUrl: data.fileUrl,
      notes: data.notes,
      createdById: user.id,
      grnLinks: links.length > 0 ? { create: links } : undefined,
      lines: { create: lines },
    },
  });

  // Fire a CC bell for disputed invoices so the variance queue isn't
  // silent — same pattern as PO PENDING_CC_APPROVAL.
  if (reviewStatus === "DISPUTED") {
    await db.notification.create({
      data: {
        outletId: outlet.id,
        kind: "WARNING",
        title: `Invoice ${data.invoiceNo} — variance review`,
        body: `Vendor billed ${inr(invoiceAmount)}, expected ${inr(expectedAmount)} · variance +${inr(variance)}`,
        link: `/inventory/invoices/${invoice.id}`,
      },
    });
  }

  await logActivity({
    action: "CREATE",
    entity: "RawMaterial",
    entityId: invoice.id,
    summary:
      reviewStatus === "MATCHED"
        ? `Invoice ${data.invoiceNo} matched expected ${inr(expectedAmount)} — awaiting verification`
        : `Invoice ${data.invoiceNo} disputed — vendor billed ${inr(invoiceAmount)} vs expected ${inr(expectedAmount)} (variance +${inr(variance)})`,
    outletId: outlet.id,
  });

  revalidatePath("/inventory/invoices");
  revalidatePath("/inventory/grn");
  redirect(`/inventory/invoices/${invoice.id}`);
}

/** Accountant action: MATCHED → CLEARED. Used on the detail page when
 *  the vendor's invoice amount matches the expected amount. */
export async function verifyVendorInvoice(invoiceId: string) {
  const user = await requireUser();
  const outlet = await getActiveOutlet();
  const inv = await db.vendorInvoice.findFirst({
    where: { id: invoiceId, outletId: outlet.id },
  });
  if (!inv) throw new Error("Invoice not found");
  if (inv.reviewStatus !== "MATCHED") {
    throw new Error(`Can only verify MATCHED invoices (this one is ${inv.reviewStatus})`);
  }
  await db.vendorInvoice.update({
    where: { id: inv.id },
    data: {
      reviewStatus: "CLEARED",
      verifiedById: user.id,
      verifiedAt: new Date(),
    },
  });
  await logActivity({
    action: "UPDATE",
    entity: "RawMaterial",
    entityId: inv.id,
    summary: `Invoice ${inv.invoiceNo} verified · cleared for payment (${inr(inv.invoiceAmount)})`,
    outletId: outlet.id,
  });
  revalidatePath("/inventory/invoices");
  revalidatePath(`/inventory/invoices/${inv.id}`);
}

/** Cost Controller action: DISPUTED → CLEARED or REJECTED per the
 *  variance reason path. Spec section 5 — Variance Review by CC. */
const VarianceReviewInput = z.object({
  invoiceId: z.string(),
  reason: z.enum(["VENDOR_MISTAKE", "PRICE_INCREASE_VALID"]),
  notes: z.string().optional(),
});
export async function reviewVendorInvoiceVariance(input: z.infer<typeof VarianceReviewInput>) {
  const user = await requireUser();
  const data = VarianceReviewInput.parse(input);
  const outlet = await getActiveOutlet();
  const inv = await db.vendorInvoice.findFirst({
    where: { id: data.invoiceId, outletId: outlet.id },
  });
  if (!inv) throw new Error("Invoice not found");
  if (inv.reviewStatus !== "DISPUTED") {
    throw new Error(`Can only review DISPUTED invoices (this one is ${inv.reviewStatus})`);
  }
  const nextStatus = data.reason === "PRICE_INCREASE_VALID" ? "CLEARED" : "REJECTED";
  await db.vendorInvoice.update({
    where: { id: inv.id },
    data: {
      reviewStatus: nextStatus,
      varianceReason: data.reason,
      varianceNotes: data.notes,
      ccReviewedById: user.id,
      ccReviewedAt: new Date(),
    },
  });
  await logActivity({
    action: "UPDATE",
    entity: "RawMaterial",
    entityId: inv.id,
    summary:
      data.reason === "PRICE_INCREASE_VALID"
        ? `CC approved invoice ${inv.invoiceNo} variance (+${inr(inv.variance)}) — cleared for payment. ${data.notes ?? ""}`
        : `CC rejected invoice ${inv.invoiceNo} — vendor mistake. ${data.notes ?? ""}`,
    outletId: outlet.id,
  });
  // Tell whoever created the invoice the verdict came back.
  await db.notification.create({
    data: {
      outletId: outlet.id,
      kind: nextStatus === "CLEARED" ? "INFO" : "WARNING",
      title:
        nextStatus === "CLEARED"
          ? `Invoice ${inv.invoiceNo} variance approved`
          : `Invoice ${inv.invoiceNo} rejected — vendor must re-invoice`,
      body: data.notes ?? "",
      link: `/inventory/invoices/${inv.id}`,
    },
  });
  revalidatePath("/inventory/invoices");
  revalidatePath(`/inventory/invoices/${inv.id}`);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const PaymentInput = z.object({
  invoiceId: z.string(),
  amount: z.coerce.number().positive(),
  mode: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"]).default("BANK_TRANSFER"),
  reference: z.string().optional(),
  occurredAt: z.string().optional(),
  notes: z.string().optional(),
});

/** Record a payment against a vendor invoice. Rolls invoice status. */
export async function recordVendorPayment(input: z.infer<typeof PaymentInput>) {
  const user = await requireUser();
  const data = PaymentInput.parse(input);
  const outlet = await getActiveOutlet();
  const inv = await db.vendorInvoice.findFirst({
    where: { id: data.invoiceId, outletId: outlet.id },
  });
  if (!inv) throw new Error("Invoice not found");
  if (inv.status === "PAID") throw new Error("Invoice already paid in full");

  const remaining = inv.grandTotal - inv.amountPaid;
  if (data.amount > remaining + 0.01) {
    throw new Error(`Payment exceeds remaining balance (${inr(Math.round(remaining))})`);
  }

  await db.$transaction(async (tx) => {
    await tx.vendorPayment.create({
      data: {
        supplierId: inv.supplierId,
        vendorInvoiceId: inv.id,
        amount: data.amount,
        mode: data.mode,
        reference: data.reference,
        occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
        notes: data.notes,
        outletId: outlet.id,
        createdById: user.id,
      },
    });
    const newPaid = inv.amountPaid + data.amount;
    const nextStatus =
      newPaid >= inv.grandTotal - 0.01 ? "PAID" : newPaid > 0 ? "PARTIAL" : "UNPAID";
    await tx.vendorInvoice.update({
      where: { id: inv.id },
      data: { amountPaid: newPaid, status: nextStatus },
    });
  });

  await logActivity({
    action: "UPDATE",
    entity: "RawMaterial",
    entityId: inv.id,
    summary: `Payment ${inr(Math.round(data.amount))} recorded against ${inv.invoiceNo}`,
    outletId: outlet.id,
  });

  revalidatePath("/inventory/invoices");
  revalidatePath(`/inventory/invoices/${inv.id}`);
}
