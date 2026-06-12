"use server";
/**
 * Vendor Invoice + Payment AP chain.
 *
 * One invoice can span multiple GRNs (vendor batches deliveries into one
 * bill); one GRN can be referenced by multiple invoices. We model this with
 * the VendorInvoiceGrnLink bridge.
 *
 * Payments allocate against a VendorInvoice (preferred) but the legacy
 * VendorPayment table can still point at a Purchase row for back-compat.
 * Payment status on the invoice rolls from UNPAID → PARTIAL → PAID
 * automatically based on sum(amountPaid).
 *
 * File upload (Supabase Storage) is wired as a string fileUrl on the
 * VendorInvoice row. The Accountant uploads the PDF via the Settings →
 * Storage interface for now; full file-upload form lands in a follow-up
 * once the bucket policy is locked down.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { logActivity } from "@/lib/audit";
import { inr } from "@/lib/utils";

const CreateInput = z.object({
  supplierId: z.string(),
  invoiceNo: z.string().min(1),
  invoiceDate: z.string(),
  subTotal: z.coerce.number().nonnegative().default(0),
  taxTotal: z.coerce.number().nonnegative().default(0),
  grandTotal: z.coerce.number().positive(),
  /** Path to the uploaded invoice file in Supabase Storage. Optional. */
  fileUrl: z.string().optional(),
  notes: z.string().optional(),
  /** GRNs this invoice covers + how much of the invoice is attributable
   *  to each. amount can be 0 (auto-split equally) or explicit. */
  grnLinks: z.array(z.object({ grnId: z.string(), amount: z.coerce.number().nonnegative().default(0) })).min(1),
});

export async function createVendorInvoice(input: z.infer<typeof CreateInput>): Promise<{ id: string }> {
  const user = await requireUser();
  const data = CreateInput.parse(input);
  const outlet = await getActiveOutlet();

  // Validate every GRN belongs to this outlet + supplier matches PO supplier
  const grns = await db.grn.findMany({
    where: { id: { in: data.grnLinks.map((l) => l.grnId) }, outletId: outlet.id },
    include: { po: { select: { supplierId: true } } },
  });
  if (grns.length !== data.grnLinks.length) throw new Error("One or more GRNs not found");
  for (const g of grns) {
    if (g.po && g.po.supplierId !== data.supplierId) {
      throw new Error("GRN supplier doesn't match invoice supplier");
    }
  }

  // Auto-split: when a link has amount=0 and there are no explicit amounts,
  // distribute grandTotal equally across GRNs.
  const explicit = data.grnLinks.filter((l) => l.amount > 0);
  let links: { grnId: string; amount: number }[];
  if (explicit.length === 0) {
    const per = Math.round((data.grandTotal / data.grnLinks.length) * 100) / 100;
    links = data.grnLinks.map((l, i) => ({
      grnId: l.grnId,
      amount: i === data.grnLinks.length - 1 ? data.grandTotal - per * (data.grnLinks.length - 1) : per,
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
      subTotal: data.subTotal,
      taxTotal: data.taxTotal,
      grandTotal: data.grandTotal,
      status: "UNPAID",
      amountPaid: 0,
      fileUrl: data.fileUrl,
      notes: data.notes,
      createdById: user.id,
      grnLinks: {
        create: links,
      },
    },
  });

  await logActivity({
    action: "CREATE",
    entity: "RawMaterial",
    entityId: invoice.id,
    summary: `Vendor invoice ${data.invoiceNo} recorded for ${inr(data.grandTotal)}`,
    outletId: outlet.id,
  });

  revalidatePath("/inventory/invoices");
  revalidatePath("/inventory/grn");
  redirect(`/inventory/invoices/${invoice.id}`);
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
