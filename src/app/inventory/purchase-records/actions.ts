"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { moveStock } from "@/lib/stock";
import { logActivity } from "@/lib/audit";
import { inr } from "@/lib/utils";

const Line = z.object({
  rawMaterialId: z.string(),
  qty: z.coerce.number().positive(),
  unit: z.string(),
  price: z.coerce.number().nonnegative(),
  discountType: z.enum(["FLAT", "PERCENT"]).default("FLAT"),
  discountValue: z.coerce.number().nonnegative().default(0),
  cgst: z.coerce.number().nonnegative().default(0),
  sgst: z.coerce.number().nonnegative().default(0),
  igst: z.coerce.number().nonnegative().default(0),
  exciseDuty: z.coerce.number().nonnegative().default(0),
  batchNo: z.string().optional(),
  expiryDate: z.string().optional(),
  varianceReason: z.string().optional(),
});

const Save = z.object({
  invoiceNo: z.string().optional(),
  invoiceDate: z.string(),
  supplierId: z.string().optional(),
  poId: z.string().optional(),
  poReferenceNo: z.string().optional(),
  otherCharges: z.coerce.number().nonnegative().default(0),
  otherTaxes: z.coerce.number().nonnegative().default(0),
  paymentType: z.enum(["UNPAID", "PAID", "PARTIAL"]).default("UNPAID"),
  paymentMode: z.string().optional(),
  paymentRef: z.string().optional(),
  amountPaid: z.coerce.number().nonnegative().default(0),
  updateStock: z.coerce.boolean().default(true),
  lines: z.array(Line).min(1),
});

/** Compute per-line amount + price-variance flag against the RM's standard purchase price. */
function lineAmount(l: z.infer<typeof Line>): number {
  const base = l.qty * l.price;
  const disc = l.discountType === "PERCENT" ? (base * l.discountValue) / 100 : l.discountValue;
  const taxable = Math.max(0, base - disc);
  const tax = taxable * (l.cgst + l.sgst + l.igst) / 100 + l.exciseDuty * l.qty;
  return taxable + tax;
}

export async function saveStockPurchase(input: z.infer<typeof Save>) {
  await requireUser("BILLER");
  const data = Save.parse(input);
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();

  // Variance enforcement
  const rms = await db.rawMaterial.findMany({
    where: { id: { in: data.lines.map((l) => l.rawMaterialId) } },
  });
  const rmMap = new Map(rms.map((r) => [r.id, r]));
  const tolerance = 0.02; // 2% default
  for (const l of data.lines) {
    const rm = rmMap.get(l.rawMaterialId);
    if (!rm) throw new Error(`Raw material not found`);
    const standard = rm.purchasePrice || rm.avgCost || 0;
    if (standard > 0 && Math.abs(l.price - standard) / standard > tolerance && !l.varianceReason) {
      throw new Error(`Price variance for ${rm.name}: ₹${l.price} vs std ₹${standard.toFixed(2)} — written reason required`);
    }
  }

  const subTotal = data.lines.reduce((s, l) => {
    const base = l.qty * l.price;
    const disc = l.discountType === "PERCENT" ? (base * l.discountValue) / 100 : l.discountValue;
    return s + Math.max(0, base - disc);
  }, 0);
  const totalDiscount = data.lines.reduce((s, l) => {
    const base = l.qty * l.price;
    return s + (l.discountType === "PERCENT" ? (base * l.discountValue) / 100 : l.discountValue);
  }, 0);
  const grand = data.lines.reduce((s, l) => s + lineAmount(l), 0) + data.otherCharges + data.otherTaxes;

  const purchase = await db.purchase.create({
    data: {
      invoiceNo: data.invoiceNo,
      invoiceDate: new Date(data.invoiceDate),
      supplierId: data.supplierId,
      poId: data.poId,
      poReferenceNo: data.poReferenceNo,
      subTotal,
      totalDiscount,
      otherCharges: data.otherCharges,
      otherTaxes: data.otherTaxes,
      grandTotal: Math.round(grand),
      paymentType: data.paymentType,
      paymentMode: data.paymentMode,
      paymentRef: data.paymentRef,
      amountPaid: data.paymentType === "PAID" ? Math.round(grand) : data.amountPaid,
      updateStock: data.updateStock,
      status: "PENDING_MANAGER",
      outletId: outlet.id,
      createdById: user?.id ?? null,
      lines: {
        create: data.lines.map((l) => ({
          rawMaterialId: l.rawMaterialId,
          qty: l.qty,
          unit: l.unit,
          price: l.price,
          discountType: l.discountType,
          discountValue: l.discountValue,
          cgst: l.cgst,
          sgst: l.sgst,
          igst: l.igst,
          exciseDuty: l.exciseDuty,
          amount: Math.round(lineAmount(l)),
          batchNo: l.batchNo,
          expiryDate: l.expiryDate ? new Date(l.expiryDate) : null,
          varianceReason: l.varianceReason,
        })),
      },
    },
    include: { lines: true },
  });

  // Update stock right away if the "Update Inventory Stock" toggle is ON.
  // (Petpooja keeps approvals optional for some accounts; for our prototype we apply on save.)
  if (data.updateStock) {
    for (const l of data.lines) {
      await moveStock({
        rawMaterialId: l.rawMaterialId,
        delta: l.qty,
        reason: "PURCHASE",
        refType: "Purchase",
        refId: purchase.id,
        note: `Stock purchase · ${data.invoiceNo ?? purchase.id}`,
      });
    }
  }

  await logActivity({
    action: "CREATE",
    entity: "Purchase",
    entityId: purchase.id,
    summary: `Logged Stock Purchase ${data.invoiceNo ?? ""} for ${inr(grand)}${data.updateStock ? " · stock updated" : ""}`,
    outletId: outlet.id,
  });

  revalidatePath("/inventory/purchase-records");
  revalidatePath("/inventory");
  redirect("/inventory/purchase-records");
}
