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
  /** GRNs this invoice covers. amount can be 0 (auto-split equally). */
  grnLinks: z
    .array(z.object({ grnId: z.string(), amount: z.coerce.number().nonnegative().default(0) }))
    .min(1),
  /** Per-item lines captured from the vendor's bill. Drives sub/tax/grand. */
  lines: z.array(LineInput).min(1),
});

export async function createVendorInvoice(
  input: z.infer<typeof CreateInput>
): Promise<{ id: string }> {
  const user = await requireUser();
  const data = CreateInput.parse(input);
  const outlet = await getActiveOutlet();

  // 1. Validate every GRN belongs to this outlet + supplier matches PO supplier.
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

  // 2. Collect the POs behind these GRNs. If every linked GRN is ad-hoc
  //    (no PO), we skip the qty cap — there's no order to bound against.
  const linkedPoIds = Array.from(new Set(grns.map((g) => g.poId).filter(Boolean) as string[]));
  const hasPoContext = linkedPoIds.length > 0;

  if (hasPoContext) {
    // Aggregate ordered qty per RM across all linked POs.
    const poLines = await db.purchaseOrderLine.findMany({
      where: { poId: { in: linkedPoIds } },
      select: { rawMaterialId: true, qty: true },
    });
    const orderedByRm = new Map<string, number>();
    for (const l of poLines) {
      orderedByRm.set(l.rawMaterialId, (orderedByRm.get(l.rawMaterialId) ?? 0) + l.qty);
    }

    // What's already been invoiced against ANY GRN tied to these POs (not
    // counting this draft). Subtract from ordered to get remaining budget.
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

    // Sum this draft's qty per RM, then check against (ordered − already invoiced).
    const draftByRm = new Map<string, number>();
    for (const l of data.lines) {
      draftByRm.set(l.rawMaterialId, (draftByRm.get(l.rawMaterialId) ?? 0) + l.qty);
    }

    // Item identity check + qty cap.
    const rmIds = Array.from(draftByRm.keys());
    const rms = await db.rawMaterial.findMany({
      where: { id: { in: rmIds }, outletId: outlet.id },
      select: { id: true, name: true },
    });
    const rmNameById = new Map(rms.map((r) => [r.id, r.name]));

    for (const [rmId, draftQty] of draftByRm) {
      const ordered = orderedByRm.get(rmId);
      if (ordered === undefined) {
        throw new Error(
          `${rmNameById.get(rmId) ?? "Item"} isn't on any of the linked POs — can't invoice it here`
        );
      }
      const already = invoicedByRm.get(rmId) ?? 0;
      const available = ordered - already;
      if (draftQty > available + 0.001) {
        throw new Error(
          `${rmNameById.get(rmId) ?? "Item"}: invoiced qty ${draftQty} exceeds remaining PO budget ${available.toFixed(
            2
          )} (ordered ${ordered}, already invoiced ${already})`
        );
      }
    }
  }

  // 3. Compute line totals + roll the invoice header.
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

  // 4. Auto-split grandTotal across linked GRNs when no explicit amounts.
  const explicit = data.grnLinks.filter((l) => l.amount > 0);
  let links: { grnId: string; amount: number }[];
  if (explicit.length === 0) {
    const per = round2(grandTotal / data.grnLinks.length);
    links = data.grnLinks.map((l, i) => ({
      grnId: l.grnId,
      amount:
        i === data.grnLinks.length - 1 ? round2(grandTotal - per * (data.grnLinks.length - 1)) : per,
    }));
  } else {
    links = data.grnLinks.map((l) => ({ grnId: l.grnId, amount: l.amount }));
  }

  const invoice = await db.vendorInvoice.create({
    data: {
      supplierId: data.supplierId,
      invoiceNo: data.invoiceNo.trim(),
      invoiceDate: new Date(data.invoiceDate),
      outletId: outlet.id,
      subTotal,
      taxTotal,
      grandTotal,
      status: "UNPAID",
      amountPaid: 0,
      fileUrl: data.fileUrl,
      notes: data.notes,
      createdById: user.id,
      grnLinks: { create: links },
      lines: { create: lines },
    },
  });

  await logActivity({
    action: "CREATE",
    entity: "RawMaterial",
    entityId: invoice.id,
    summary: `Vendor invoice ${data.invoiceNo} recorded for ${inr(grandTotal)} (${
      lines.length
    } line${lines.length === 1 ? "" : "s"})`,
    outletId: outlet.id,
  });

  revalidatePath("/inventory/invoices");
  revalidatePath("/inventory/grn");
  redirect(`/inventory/invoices/${invoice.id}`);
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
