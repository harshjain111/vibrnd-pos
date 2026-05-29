"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { logActivity } from "@/lib/audit";

const D = z.object({
  id: z.string().optional(),
  code: z.string().min(1).max(32).transform((s) => s.toUpperCase().trim()),
  name: z.string().min(1),
  type: z.enum(["FLAT", "PERCENT", "BOGO"]),
  value: z.coerce.number().nonnegative(),
  minOrder: z.coerce.number().nonnegative().default(0),
  maxDiscount: z.coerce.number().nonnegative().optional(),
  active: z.coerce.boolean().default(true),
});

export async function saveDiscount(fd: FormData) {
  const outlet = await getActiveOutlet();
  const parsed = D.parse({
    id: fd.get("id") || undefined,
    code: fd.get("code"),
    name: fd.get("name"),
    type: fd.get("type"),
    value: fd.get("value"),
    minOrder: fd.get("minOrder") || 0,
    maxDiscount: fd.get("maxDiscount") || undefined,
    active: fd.get("active") === "on",
  });

  if (parsed.id) {
    await db.discount.update({ where: { id: parsed.id }, data: { ...parsed, id: undefined } });
    await logActivity({
      action: "UPDATE",
      entity: "Discount",
      entityId: parsed.id,
      summary: `Updated coupon ${parsed.code}`,
      outletId: outlet.id,
    });
  } else {
    const d = await db.discount.create({ data: { ...parsed, id: undefined, outletId: outlet.id } });
    await logActivity({
      action: "CREATE",
      entity: "Discount",
      entityId: d.id,
      summary: `Created coupon ${parsed.code} (${parsed.type})`,
      outletId: outlet.id,
    });
  }
  revalidatePath("/menu/discounts");
  revalidatePath("/billing");
  revalidatePath("/logs");
}

export async function deleteDiscount(fd: FormData) {
  const id = String(fd.get("id"));
  if (!id) return;
  const d = await db.discount.findUnique({ where: { id } });
  await db.discount.delete({ where: { id } });
  if (d) {
    await logActivity({
      action: "DELETE",
      entity: "Discount",
      entityId: id,
      summary: `Deleted coupon ${d.code}`,
      outletId: d.outletId,
    });
  }
  revalidatePath("/menu/discounts");
  revalidatePath("/billing");
  revalidatePath("/logs");
}

export async function lookupDiscount(code: string, subTotal: number) {
  if (!code) return null;
  const d = await db.discount.findUnique({ where: { code: code.toUpperCase().trim() } });
  if (!d || !d.active) return { error: "Invalid or inactive code" } as const;
  if (subTotal < d.minOrder)
    return { error: `Minimum order ₹${d.minOrder} required (current ₹${subTotal.toFixed(0)})` } as const;

  let amount = 0;
  if (d.type === "FLAT") amount = d.value;
  else if (d.type === "PERCENT") {
    amount = (subTotal * d.value) / 100;
    if (d.maxDiscount) amount = Math.min(amount, d.maxDiscount);
  } else if (d.type === "BOGO") {
    // Simplification: BOGO = 50% off subtotal, capped
    amount = subTotal / 2;
    if (d.maxDiscount) amount = Math.min(amount, d.maxDiscount);
  }
  return { ok: true, amount: Math.round(amount), code: d.code, name: d.name } as const;
}
