"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";

const ItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  shortCode: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  price: z.coerce.number().nonnegative(),
  taxRate: z.coerce.number().min(0).max(100),
  categoryId: z.string().min(1),
  dietary: z.enum(["VEG", "NON_VEG", "EGG", "JAIN"]).default("VEG"),
  isVeg: z.coerce.boolean().default(true),
  active: z.coerce.boolean().default(true),
  outOfStock: z.coerce.boolean().default(false),
});

export async function saveItem(formData: FormData) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const dietary = (formData.get("dietary") as string) || "VEG";
  const parsed = ItemSchema.parse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    shortCode: formData.get("shortCode") || undefined,
    description: formData.get("description") || undefined,
    imageUrl: formData.get("imageUrl") || undefined,
    price: formData.get("price"),
    taxRate: formData.get("taxRate"),
    categoryId: formData.get("categoryId"),
    dietary,
    // Keep isVeg in sync with the dietary marker so legacy queries still work.
    isVeg: dietary === "VEG" || dietary === "JAIN",
    active: formData.get("active") === "on",
    outOfStock: formData.get("outOfStock") === "on",
  });

  if (parsed.id) {
    await db.item.update({
      where: { id: parsed.id },
      data: { ...parsed, id: undefined },
    });
  } else {
    await db.item.create({ data: { ...parsed, id: undefined, outletId: outlet.id } });
  }
  revalidatePath("/menu");
}

export async function deleteItem(formData: FormData) {
  await requireUser("MANAGER");
  const id = String(formData.get("id"));
  if (!id) return;
  // soft-delete by deactivating to preserve order history
  await db.item.update({ where: { id }, data: { active: false } });
  revalidatePath("/menu");
}

export async function toggleOutOfStock(formData: FormData) {
  await requireUser("BILLER");
  const id = String(formData.get("id"));
  const item = await db.item.findUnique({ where: { id } });
  if (!item) return;
  await db.item.update({ where: { id }, data: { outOfStock: !item.outOfStock } });
  revalidatePath("/menu");
}

const CategorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  rank: z.coerce.number().int().nonnegative().default(0),
});

export async function saveCategory(formData: FormData) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const parsed = CategorySchema.parse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    rank: formData.get("rank") || 0,
  });

  if (parsed.id) {
    await db.category.update({ where: { id: parsed.id }, data: { name: parsed.name, rank: parsed.rank } });
  } else {
    await db.category.create({ data: { name: parsed.name, rank: parsed.rank, outletId: outlet.id } });
  }
  revalidatePath("/menu");
}

const VariantsInput = z.object({
  itemId: z.string(),
  variants: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      price: z.coerce.number().nonnegative(),
    })
  ),
});

export async function saveVariants(input: z.infer<typeof VariantsInput>) {
  await requireUser("MANAGER");
  const parsed = VariantsInput.parse(input);
  await db.itemVariant.deleteMany({ where: { itemId: parsed.itemId } });
  for (let i = 0; i < parsed.variants.length; i++) {
    await db.itemVariant.create({
      data: {
        itemId: parsed.itemId,
        name: parsed.variants[i].name,
        price: parsed.variants[i].price,
        rank: i,
      },
    });
  }
  revalidatePath("/menu");
  revalidatePath(`/menu/items/${parsed.itemId}`);
  revalidatePath("/billing");
}

const AddonsInput = z.object({
  itemId: z.string(),
  addons: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      priceDelta: z.coerce.number(),
    })
  ),
});

export async function saveAddons(input: z.infer<typeof AddonsInput>) {
  await requireUser("MANAGER");
  const parsed = AddonsInput.parse(input);
  await db.addon.deleteMany({ where: { itemId: parsed.itemId } });
  for (let i = 0; i < parsed.addons.length; i++) {
    await db.addon.create({
      data: {
        itemId: parsed.itemId,
        name: parsed.addons[i].name,
        priceDelta: parsed.addons[i].priceDelta,
        rank: i,
      },
    });
  }
  revalidatePath("/menu");
  revalidatePath(`/menu/items/${parsed.itemId}`);
  revalidatePath("/billing");
}
