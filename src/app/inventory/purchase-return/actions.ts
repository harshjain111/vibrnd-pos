"use server";
/**
 * Purchase Return (debit note).
 *
 * A return can be raised against either a Purchase Order or a Stock Purchase
 * (vendor invoice) — the source supplies the item list + rates, and the user
 * picks how much of each to send back. On save we:
 *   • create a PurchaseReturn (debit note) with the lines snapshotted in
 *     linesJson + the source reference,
 *   • decrement raw-material stock for the returned qty (reason
 *     PURCHASE_RETURN) at the outlet's STORE department — the goods leave us.
 *
 * Stock is reduced here because a return physically removes received goods.
 * The financial offset against the supplier is reflected via the debit-note
 * total (shown on the supplier ledger / reports).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { logActivity } from "@/lib/audit";
import { moveStock } from "@/lib/stock";
import { inr } from "@/lib/utils";

const LineInput = z.object({
  rawMaterialId: z.string(),
  name: z.string(),
  qty: z.coerce.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.coerce.number().nonnegative(),
  taxRate: z.coerce.number().nonnegative().default(0),
});

const CreateInput = z.object({
  supplierId: z.string().min(1),
  sourceType: z.enum(["PO", "STOCK_PURCHASE"]),
  sourceId: z.string().min(1),
  sourceNo: z.string().min(1),
  debitNoteDate: z.string(),
  reason: z.string().optional(),
  lines: z.array(LineInput).min(1, "Pick at least one item to return"),
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function nextDebitNoteNo(outletId: string, outletCode: string) {
  const count = await db.purchaseReturn.count({ where: { outletId } });
  return `DN-${outletCode}-${String(count + 1).padStart(6, "0")}`;
}

export async function createPurchaseReturn(input: z.infer<typeof CreateInput>): Promise<{ id: string }> {
  const user = await requireUser();
  const data = CreateInput.parse(input);
  const outlet = await getActiveOutlet();

  const supplier = await db.supplier.findUnique({ where: { id: data.supplierId } });
  if (!supplier) throw new Error("Supplier not found");

  // Validate the items belong to this outlet.
  const rms = await db.rawMaterial.findMany({
    where: { id: { in: data.lines.map((l) => l.rawMaterialId) }, outletId: outlet.id },
    select: { id: true, name: true },
  });
  const rmIds = new Set(rms.map((r) => r.id));
  for (const l of data.lines) {
    if (!rmIds.has(l.rawMaterialId)) throw new Error(`${l.name} isn't in this outlet's catalog`);
  }

  const lines = data.lines.map((l) => {
    const lineSubTotal = round2(l.qty * l.unitPrice);
    const lineTax = round2((lineSubTotal * l.taxRate) / 100);
    return {
      rawMaterialId: l.rawMaterialId,
      name: l.name,
      qty: l.qty,
      unit: l.unit,
      unitPrice: l.unitPrice,
      taxRate: l.taxRate,
      lineSubTotal,
      lineTax,
      lineTotal: round2(lineSubTotal + lineTax),
    };
  });
  const grandTotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));

  const debitNoteNo = await nextDebitNoteNo(outlet.id, outlet.code);

  const ret = await db.purchaseReturn.create({
    data: {
      debitNoteNo,
      debitNoteDate: new Date(data.debitNoteDate),
      supplierId: data.supplierId,
      reason: data.reason,
      grandTotal,
      outletId: outlet.id,
      status: "CONFIRMED",
      linesJson: JSON.stringify({
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        sourceNo: data.sourceNo,
        supplierName: supplier.name,
        lines,
      }),
    },
  });

  // Reduce stock at STORE for the returned goods.
  const storeDept = await db.department.findFirst({
    where: { outletId: outlet.id, kind: "STORE", active: true },
    select: { id: true },
  });
  for (const l of lines) {
    await moveStock({
      rawMaterialId: l.rawMaterialId,
      delta: -l.qty,
      reason: "PURCHASE_RETURN",
      refType: "PurchaseReturn",
      refId: ret.id,
      departmentId: storeDept?.id ?? null,
      note: `${debitNoteNo} · returned to ${supplier.name}`,
    });
  }

  await logActivity({
    action: "CREATE",
    entity: "RawMaterial",
    entityId: ret.id,
    summary: `Purchase return ${debitNoteNo} to ${supplier.name} for ${inr(grandTotal)} (${lines.length} item${lines.length === 1 ? "" : "s"}) against ${data.sourceNo}`,
    outletId: outlet.id,
  });

  revalidatePath("/inventory/purchase-return");
  redirect(`/inventory/purchase-return/${ret.id}`);
}
