"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { logActivity } from "@/lib/audit";

/**
 * CSV import / export of menu items (audit TASK 13).
 *
 * The export and import use the same column order so a round-trip works:
 *   name, shortCode, category, price, taxRate, dietary, active, outOfStock, description, imageUrl
 *
 * Import behaviour:
 *   • Matches existing items by name within the active outlet (case-insensitive).
 *   • Creates the category if it doesn't exist yet.
 *   • Skips rows with empty name or invalid price.
 *   • Returns a tally of inserted / updated / skipped rows.
 */

const HEADER = [
  "name",
  "shortCode",
  "category",
  "price",
  "taxRate",
  "dietary",
  "active",
  "outOfStock",
  "description",
  "imageUrl",
] as const;

export async function exportItemsCsv(): Promise<string> {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const items = await db.item.findMany({
    where: { outletId: outlet.id },
    include: { category: true },
    orderBy: [{ category: { rank: "asc" } }, { name: "asc" }],
  });
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [HEADER.join(",")];
  for (const it of items) {
    rows.push(
      [
        escape(it.name),
        escape(it.shortCode ?? ""),
        escape(it.category?.name ?? ""),
        String(it.price),
        String(it.taxRate),
        String((it as any).dietary ?? (it.isVeg ? "VEG" : "NON_VEG")),
        it.active ? "true" : "false",
        it.outOfStock ? "true" : "false",
        escape(it.description ?? ""),
        escape(it.imageUrl ?? ""),
      ].join(",")
    );
  }
  return rows.join("\n");
}

export async function downloadTemplate(): Promise<string> {
  return [
    HEADER.join(","),
    `"Masala Dosa","MD","Breakfast",150,5,VEG,true,false,"Crispy classic dosa with chutney + sambar",""`,
    `"Butter Chicken","BC","Mains",380,5,NON_VEG,true,false,"Slow-cooked tomato gravy",""`,
  ].join("\n");
}

export async function importItemsCsv(csv: string): Promise<{ inserted: number; updated: number; skipped: number; errors: string[] }> {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const errors: string[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  // Cheap CSV parser — handles quoted strings + embedded commas + escaped quotes.
  const rows = parseCsv(csv);
  if (rows.length === 0) return { inserted, updated, skipped, errors: ["Empty file"] };
  const header = rows[0].map((c) => c.trim());
  const idx = (col: string) => header.indexOf(col);

  // Header sanity check.
  const required = ["name", "category", "price"];
  for (const c of required) {
    if (idx(c) === -1) {
      errors.push(`Missing required column: ${c}`);
    }
  }
  if (errors.length) return { inserted, updated, skipped, errors };

  // Pre-load existing items + categories so we don't N+1 query.
  const existing = await db.item.findMany({
    where: { outletId: outlet.id },
    select: { id: true, name: true },
  });
  const existingByName = new Map(existing.map((it) => [it.name.toLowerCase(), it.id]));
  const categories = await db.category.findMany({
    where: { outletId: outlet.id },
    select: { id: true, name: true },
  });
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0 || r.every((c) => !c.trim())) continue;
    const name = (r[idx("name")] ?? "").trim();
    if (!name) {
      skipped++;
      continue;
    }
    const categoryName = (r[idx("category")] ?? "").trim() || "Uncategorised";
    const price = Number(r[idx("price")] ?? "0");
    if (!isFinite(price) || price < 0) {
      skipped++;
      errors.push(`Row ${i + 1} (${name}): invalid price`);
      continue;
    }
    const taxRate = idx("taxRate") >= 0 ? Number(r[idx("taxRate")] ?? "5") : 5;
    const dietary = idx("dietary") >= 0 ? (r[idx("dietary")] ?? "VEG").trim().toUpperCase() : "VEG";
    const active = parseBool(r[idx("active")] ?? "true");
    const outOfStock = parseBool(r[idx("outOfStock")] ?? "false");
    const shortCode = idx("shortCode") >= 0 ? (r[idx("shortCode")] ?? "").trim() : "";
    const description = idx("description") >= 0 ? (r[idx("description")] ?? "").trim() : "";
    const imageUrl = idx("imageUrl") >= 0 ? (r[idx("imageUrl")] ?? "").trim() : "";

    // Get/create category.
    let categoryId = catByName.get(categoryName.toLowerCase());
    if (!categoryId) {
      const created = await db.category.create({
        data: { name: categoryName, outletId: outlet.id, rank: categories.length + 1 },
      });
      categoryId = created.id;
      catByName.set(categoryName.toLowerCase(), categoryId);
    }

    const dietaryValid: "VEG" | "NON_VEG" | "EGG" | "JAIN" =
      ["VEG", "NON_VEG", "EGG", "JAIN"].includes(dietary) ? (dietary as any) : "VEG";

    const data = {
      name,
      shortCode: shortCode || null,
      description: description || null,
      imageUrl: imageUrl || null,
      price,
      taxRate,
      dietary: dietaryValid,
      isVeg: dietaryValid === "VEG" || dietaryValid === "JAIN",
      active,
      outOfStock,
      categoryId,
    };

    const existingId = existingByName.get(name.toLowerCase());
    if (existingId) {
      await db.item.update({ where: { id: existingId }, data });
      updated++;
    } else {
      await db.item.create({ data: { ...data, outletId: outlet.id } });
      inserted++;
    }
  }

  await logActivity({
    action: "UPDATE",
    entity: "Item",
    summary: `Bulk import: ${inserted} new, ${updated} updated, ${skipped} skipped`,
    outletId: outlet.id,
  });
  revalidatePath("/menu");
  return { inserted, updated, skipped, errors };
}

function parseBool(s: string): boolean {
  const v = (s ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "y";
}

/** RFC-4180-ish CSV parser. Good enough for hand-edited spreadsheets. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cell += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else { cell += c; }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
