"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { logActivity } from "@/lib/audit";

/** Single fixed asset (table / chair / sofa / kitchen unit / decor / etc). */
const AssetSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  category: z.enum(["FURNITURE", "KITCHEN", "ELECTRONICS", "DECOR", "OTHER"]).default("FURNITURE"),
  location: z.string().optional(),
  qty: z.coerce.number().int().min(0),
  unitValue: z.coerce.number().nonnegative().default(0),
  condition: z.enum(["GOOD", "FAIR", "DAMAGED", "DISCARDED"]).default("GOOD"),
  purchasedAt: z.string().optional(),
  notes: z.string().optional(),
});

export async function saveAsset(fd: FormData) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const p = AssetSchema.parse({
    id: fd.get("id") || undefined,
    name: fd.get("name"),
    category: fd.get("category") || "FURNITURE",
    location: fd.get("location") || undefined,
    qty: fd.get("qty") ?? 1,
    unitValue: fd.get("unitValue") ?? 0,
    condition: fd.get("condition") || "GOOD",
    purchasedAt: fd.get("purchasedAt") || undefined,
    notes: fd.get("notes") || undefined,
  });
  const data = {
    name: p.name,
    category: p.category,
    location: p.location,
    qty: p.qty,
    unitValue: p.unitValue,
    condition: p.condition,
    purchasedAt: p.purchasedAt ? new Date(p.purchasedAt) : null,
    notes: p.notes,
  };
  if (p.id) {
    await db.fixedAsset.update({ where: { id: p.id }, data });
  } else {
    await db.fixedAsset.create({ data: { ...data, outletId: outlet.id, active: true } });
  }
  await logActivity({
    action: p.id ? "UPDATE" : "CREATE",
    entity: "Outlet",
    summary: `${p.id ? "Updated" : "Added"} fixed asset ${p.name} (×${p.qty})`,
    outletId: outlet.id,
  });
  revalidatePath("/inventory/assets");
}

export async function deleteAsset(fd: FormData) {
  await requireUser("MANAGER");
  const id = String(fd.get("id") || "");
  if (!id) return;
  // Soft-delete so historical audits still link.
  await db.fixedAsset.update({ where: { id }, data: { active: false } });
  revalidatePath("/inventory/assets");
}

/**
 * Submit a periodic audit — compares expected (current qty in register) vs
 * actual found qty. Variance > 0 lines surface as an anti-theft signal AND
 * update the register qty to the audited value so the next audit reads from
 * a fresh baseline.
 */
const AuditLineInput = z.object({
  assetId: z.string(),
  foundQty: z.coerce.number().int().min(0),
  conditionAfter: z.enum(["GOOD", "FAIR", "DAMAGED", "DISCARDED"]).optional(),
  note: z.string().optional(),
});
const AuditInput = z.object({
  notes: z.string().optional(),
  lines: z.array(AuditLineInput).min(1),
});

export async function submitAudit(input: z.infer<typeof AuditInput>) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const data = AuditInput.parse(input);

  // Build lines + compute variance against the *current* register state.
  const assetIds = data.lines.map((l) => l.assetId);
  const assets = await db.fixedAsset.findMany({
    where: { id: { in: assetIds }, outletId: outlet.id, active: true },
  });
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  let varianceLines = 0;
  const linesToCreate = data.lines.map((l) => {
    const a = assetMap.get(l.assetId);
    if (!a) throw new Error("Asset not found");
    const variance = l.foundQty - a.qty;
    if (variance !== 0) varianceLines++;
    return {
      assetId: l.assetId,
      expectedQty: a.qty,
      foundQty: l.foundQty,
      variance,
      conditionAfter: l.conditionAfter ?? null,
      note: l.note ?? null,
    };
  });

  const audit = await db.assetAudit.create({
    data: {
      outletId: outlet.id,
      auditedById: user?.id ?? null,
      notes: data.notes ?? null,
      varianceLines,
      lines: { create: linesToCreate },
    },
  });

  // Apply the audit results to the register (qty + condition).
  for (const l of data.lines) {
    await db.fixedAsset.update({
      where: { id: l.assetId },
      data: {
        qty: l.foundQty,
        ...(l.conditionAfter ? { condition: l.conditionAfter } : {}),
      },
    });
  }

  await logActivity({
    action: "UPDATE",
    entity: "Outlet",
    summary: `Fixed-asset audit — ${data.lines.length} item(s) checked, ${varianceLines} variance line(s)`,
    outletId: outlet.id,
  });

  // Variance pings as a notification (anti-theft signal).
  if (varianceLines > 0) {
    await db.notification.create({
      data: {
        outletId: outlet.id,
        kind: "INFO",
        title: `Fixed-asset audit flagged ${varianceLines} variance${varianceLines === 1 ? "" : "s"}`,
        body: `Open the audit detail to see which items don't match.`,
        link: `/inventory/assets/audits/${audit.id}`,
      },
    });
  }

  revalidatePath("/inventory/assets");
  revalidatePath("/inventory/assets/audits");
  redirect(`/inventory/assets/audits/${audit.id}`);
}
