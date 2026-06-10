"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { moveStock } from "@/lib/stock";
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

/**
 * Allocate the next per-outlet PO number. The schema marks `poNo @unique`
 * globally, so a simple per-outlet count would inevitably collide with
 * another outlet's POs and Prisma would reject with P2002 — which Next.js
 * in production masks as the cryptic "Server Components render" digest.
 *
 * Fix: scope the number with the outlet code AND retry on the rare clash
 * (legacy unprefixed PO-000001 numbers, two managers hitting Save at the
 * same instant, etc).
 */
async function nextPoNo(outletId: string, outletCode: string) {
  const count = await db.purchaseOrder.count({ where: { outletId } });
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `PO-${outletCode}-${String(count + 1 + attempt).padStart(6, "0")}`;
    const clash = await db.purchaseOrder.findUnique({ where: { poNo: candidate } });
    if (!clash) return candidate;
  }
  throw new Error("Could not allocate a PO number");
}

export async function createPO(input: z.infer<typeof POInput>): Promise<{ id: string; poNo: string }> {
  const data = POInput.parse(input);
  const outlet = await getActiveOutlet();
  const sub = data.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const tax = 0; // simplification — no tax on POs in v1
  const grand = Math.round(sub + tax);
  const poNo = await nextPoNo(outlet.id, outlet.code);

  const po = await db.purchaseOrder.create({
    data: {
      poNo,
      supplierId: data.supplierId,
      outletId: outlet.id,
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
    summary: `Drafted ${poNo} for ${inr(grand)}`,
    outletId: outlet.id,
  });

  revalidatePath("/inventory/purchase");
  revalidatePath("/logs");
  return { id: po.id, poNo };
}

export async function markSent(fd: FormData) {
  const id = String(fd.get("id"));
  const po = await db.purchaseOrder.findUnique({ where: { id } });
  if (!po || po.status !== "DRAFT") return;
  await db.purchaseOrder.update({ where: { id }, data: { status: "SENT" } });
  await logActivity({
    action: "UPDATE",
    entity: "RawMaterial",
    entityId: id,
    summary: `Sent ${po.poNo} to supplier`,
    outletId: po.outletId,
  });
  revalidatePath("/inventory/purchase");
  revalidatePath(`/inventory/purchase/${id}`);
  revalidatePath("/logs");
}

export async function receivePO(fd: FormData) {
  const id = String(fd.get("id"));
  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: { lines: true, supplier: true },
  });
  if (!po || po.status === "RECEIVED" || po.status === "CANCELLED") return;

  // Stock in each line via moveStock + recompute avgCost
  for (const l of po.lines) {
    const rm = await db.rawMaterial.findUnique({ where: { id: l.rawMaterialId } });
    if (!rm) continue;

    const before = rm.currentQty;
    const newQty = before + l.qty;
    const newAvgCost =
      newQty > 0 ? (before * rm.avgCost + l.qty * l.unitPrice) / newQty : l.unitPrice;

    await db.rawMaterial.update({
      where: { id: rm.id },
      data: { avgCost: newAvgCost },
    });
    await moveStock({
      rawMaterialId: rm.id,
      delta: l.qty,
      reason: "PURCHASE",
      refType: "PO",
      refId: id,
      note: `${po.poNo} · ${po.supplier.name} · ₹${l.unitPrice}/${l.unit}`,
    });
  }

  await db.purchaseOrder.update({
    where: { id },
    data: { status: "RECEIVED", receivedAt: new Date() },
  });

  await logActivity({
    action: "UPDATE",
    entity: "RawMaterial",
    entityId: id,
    summary: `Received ${po.poNo} from ${po.supplier.name} (${inr(po.grandTotal)})`,
    outletId: po.outletId,
  });

  revalidatePath("/inventory");
  revalidatePath("/inventory/purchase");
  revalidatePath(`/inventory/purchase/${id}`);
  revalidatePath("/inventory/movements");
  revalidatePath("/logs");
}

export async function cancelPO(fd: FormData) {
  const id = String(fd.get("id"));
  const po = await db.purchaseOrder.findUnique({ where: { id } });
  if (!po || po.status === "RECEIVED") return;
  await db.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED" } });
  await logActivity({
    action: "CANCEL",
    entity: "RawMaterial",
    entityId: id,
    summary: `Cancelled ${po.poNo}`,
    outletId: po.outletId,
  });
  revalidatePath("/inventory/purchase");
  revalidatePath(`/inventory/purchase/${id}`);
  revalidatePath("/logs");
}
