"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { moveStock } from "@/lib/stock";
import { logActivity } from "@/lib/audit";

const RM = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  unit: z.string().min(1),
  parLevel: z.coerce.number().nonnegative(),
  minLevel: z.coerce.number().nonnegative(),
  currentQty: z.coerce.number().nonnegative(),
  avgCost: z.coerce.number().nonnegative(),
  supplierId: z.string().optional(),
});

export async function saveRawMaterial(fd: FormData) {
  const outlet = await getActiveOutlet();
  const parsed = RM.parse({
    id: fd.get("id") || undefined,
    name: fd.get("name"),
    unit: fd.get("unit"),
    parLevel: fd.get("parLevel"),
    minLevel: fd.get("minLevel"),
    currentQty: fd.get("currentQty"),
    avgCost: fd.get("avgCost"),
    supplierId: fd.get("supplierId") || undefined,
  });

  if (parsed.id) {
    await db.rawMaterial.update({ where: { id: parsed.id }, data: { ...parsed, id: undefined } });
  } else {
    await db.rawMaterial.create({ data: { ...parsed, id: undefined, outletId: outlet.id } });
  }
  revalidatePath("/inventory");
}

const Supplier = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  contact: z.string().optional(),
  phone: z.string().optional(),
  gstin: z.string().optional(),
  address: z.string().optional(),
});

export async function saveSupplier(fd: FormData) {
  const parsed = Supplier.parse({
    id: fd.get("id") || undefined,
    name: fd.get("name"),
    contact: fd.get("contact") || undefined,
    phone: fd.get("phone") || undefined,
    gstin: fd.get("gstin") || undefined,
    address: fd.get("address") || undefined,
  });

  if (parsed.id) {
    await db.supplier.update({ where: { id: parsed.id }, data: { ...parsed, id: undefined } });
  } else {
    await db.supplier.create({ data: { ...parsed, id: undefined } });
  }
  revalidatePath("/inventory/suppliers");
}

/* ──────────────────────────────────────────────────────────────────────
   Supplier rate card
   ────────────────────────────────────────────────────────────────────── */

const RateCardLine = z.object({
  rawMaterialId: z.string(),
  negotiatedRate: z.coerce.number().nonnegative(),
  isPrimary: z.boolean().default(false),
});

const RateCardInput = z.object({
  supplierId: z.string(),
  creditDays: z.coerce.number().int().min(0).max(365).default(0),
  lines: z.array(RateCardLine),
});

/**
 * Replace the rate card for a supplier in one shot — easier than diffing
 * adds/updates/removes against the UI editor. Also stamps `creditDays` on
 * the Supplier so the AP team can see payment terms at a glance.
 *
 * Inputs that point at the same rawMaterialId are de-duplicated server-side
 * (last write wins), so the UI doesn't have to be paranoid about it.
 */
export async function saveSupplierRateCard(
  input: z.infer<typeof RateCardInput>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const data = RateCardInput.parse(input);
    const supplier = await db.supplier.findUnique({ where: { id: data.supplierId } });
    if (!supplier) throw new Error("Supplier not found");
    const outlet = await getActiveOutlet();

    // Validate every raw material belongs to this outlet (catalog-scoped).
    if (data.lines.length > 0) {
      const rmIds = Array.from(new Set(data.lines.map((l) => l.rawMaterialId)));
      const rms = await db.rawMaterial.findMany({
        where: { id: { in: rmIds }, outletId: outlet.id },
        select: { id: true },
      });
      if (rms.length !== rmIds.length) {
        throw new Error("One or more items are not from this outlet's catalog");
      }
    }

    // De-dupe by rawMaterialId (last write wins).
    const byRm = new Map<string, typeof data.lines[number]>();
    for (const l of data.lines) byRm.set(l.rawMaterialId, l);
    const cleaned = Array.from(byRm.values());

    await db.$transaction([
      db.supplier.update({
        where: { id: data.supplierId },
        data: { creditDays: data.creditDays },
      }),
      db.rawMaterialSupplier.deleteMany({ where: { supplierId: data.supplierId } }),
      ...(cleaned.length > 0
        ? [
            db.rawMaterialSupplier.createMany({
              data: cleaned.map((l) => ({
                supplierId: data.supplierId,
                rawMaterialId: l.rawMaterialId,
                negotiatedRate: l.negotiatedRate,
                isPrimary: l.isPrimary,
              })),
            }),
          ]
        : []),
    ]);

    await logActivity({
      action: "UPDATE",
      entity: "RawMaterial",
      entityId: data.supplierId,
      summary: `Rate card for ${supplier.name} updated — ${cleaned.length} item(s), ${data.creditDays}d credit`,
      outletId: outlet.id,
    });

    revalidatePath("/inventory/suppliers");
    revalidatePath(`/inventory/suppliers/${data.supplierId}/rate-card`);
    revalidatePath("/inventory/purchase/new");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const RecipeIngredientInput = z.object({
  rawMaterialId: z.string(),
  qty: z.coerce.number().positive(),
  unit: z.string(),
});
const AddonGroupInput = z.object({
  addonId: z.string(),
  ingredients: z.array(RecipeIngredientInput),
});
const RecipeInput = z.object({
  itemId: z.string(),
  itemVariantId: z.string(),
  /** Always-consumed ingredients for this (item, variant). */
  base: z.array(RecipeIngredientInput),
  /** Per-addon ingredients — only consumed when the customer picks that
   *  specific addon on the bill. Each addon configured per-variant so e.g.
   *  Extra Cheese on Burger Veg can pull different qty than on Chicken. */
  addons: z.array(AddonGroupInput).default([]),
});

export type RecipeActionResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Upsert one recipe for a (item, variant) pair. Replaces all existing
 * ingredients in a single transaction so the saved state always matches
 * what the form posts.
 */
export async function saveRecipe(input: z.infer<typeof RecipeInput>): Promise<RecipeActionResult> {
  try {
    const data = RecipeInput.parse(input);

    // Validate the variant belongs to the item.
    const variant = await db.itemVariant.findFirst({
      where: { id: data.itemVariantId, itemId: data.itemId },
    });
    if (!variant) {
      return { ok: false, error: "Variant doesn't belong to this item" };
    }

    // Validate any addonId references belong to the same item.
    if (data.addons.length > 0) {
      const addonIds = data.addons.map((a) => a.addonId);
      const found = await db.addon.findMany({
        where: { id: { in: addonIds }, itemId: data.itemId },
      });
      if (found.length !== addonIds.length) {
        return { ok: false, error: "One or more addons don't belong to this item" };
      }
    }

    // Find-or-create the recipe row, then swap ingredients atomically.
    const existing = await db.recipe.findFirst({
      where: { itemId: data.itemId, itemVariantId: data.itemVariantId },
    });
    const recipeId = await db.$transaction(async (tx) => {
      let id: string;
      if (existing) {
        id = existing.id;
        await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
      } else {
        const created = await tx.recipe.create({
          data: { itemId: data.itemId, itemVariantId: data.itemVariantId },
        });
        id = created.id;
      }
      const rows = [
        ...data.base.map((ing) => ({
          recipeId: id,
          rawMaterialId: ing.rawMaterialId,
          qty: ing.qty,
          unit: ing.unit,
          addonId: null as string | null,
        })),
        ...data.addons.flatMap((grp) =>
          grp.ingredients.map((ing) => ({
            recipeId: id,
            rawMaterialId: ing.rawMaterialId,
            qty: ing.qty,
            unit: ing.unit,
            addonId: grp.addonId,
          }))
        ),
      ];
      if (rows.length > 0) {
        await tx.recipeIngredient.createMany({ data: rows });
      }
      return id;
    });

    revalidatePath("/inventory/recipes");
    return { ok: true, id: recipeId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteRecipe(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    const id = String(fd.get("id") ?? "");
    if (!id) return { ok: false, error: "Recipe id required" };
    await db.recipe.delete({ where: { id } });
    revalidatePath("/inventory/recipes");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function adjustStock(fd: FormData) {
  const id = String(fd.get("id"));
  const delta = Number(fd.get("delta")) || 0;
  if (!delta) return;
  await moveStock({
    rawMaterialId: id,
    delta,
    reason: delta < 0 ? "WASTAGE" : "ADJUST",
    refType: "Manual",
    note: `Manual ${delta > 0 ? "in" : "out"}`,
  });
  revalidatePath("/inventory");
  revalidatePath("/inventory/movements");
}
