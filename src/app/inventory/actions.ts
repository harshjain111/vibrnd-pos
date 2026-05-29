"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { moveStock } from "@/lib/stock";

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

const Recipe = z.object({
  itemId: z.string(),
  ingredients: z.array(
    z.object({ rawMaterialId: z.string(), qty: z.coerce.number().positive(), unit: z.string() })
  ),
});

export async function saveRecipe(input: z.infer<typeof Recipe>) {
  const parsed = Recipe.parse(input);
  await db.recipe.upsert({
    where: { itemId: parsed.itemId },
    update: {
      ingredients: {
        deleteMany: {},
        create: parsed.ingredients,
      },
    },
    create: {
      itemId: parsed.itemId,
      ingredients: { create: parsed.ingredients },
    },
  });
  revalidatePath("/inventory/recipes");
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
