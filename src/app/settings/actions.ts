"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";

const Outlet = z.object({
  id: z.string(),
  name: z.string().min(1),
  code: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  gstin: z.string().optional(),
  fssai: z.string().optional(),
  currency: z.string().min(1).max(8).default("INR"),
  timezone: z.string().min(1).default("Asia/Kolkata"),
});

export async function saveOutlet(fd: FormData) {
  const parsed = Outlet.parse({
    id: fd.get("id"),
    name: fd.get("name"),
    code: fd.get("code"),
    address: fd.get("address") || undefined,
    phone: fd.get("phone") || undefined,
    email: fd.get("email") || undefined,
    gstin: fd.get("gstin") || undefined,
    fssai: fd.get("fssai") || undefined,
    currency: fd.get("currency") || "INR",
    timezone: fd.get("timezone") || "Asia/Kolkata",
  });
  await db.outlet.update({ where: { id: parsed.id }, data: { ...parsed, id: undefined } });
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

const DiningTableSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  area: z.string().default("Main"),
  capacity: z.coerce.number().int().positive().default(4),
});

export async function saveTable(fd: FormData) {
  const outlet = await db.outlet.findFirstOrThrow();
  const parsed = DiningTableSchema.parse({
    id: fd.get("id") || undefined,
    name: fd.get("name"),
    area: fd.get("area") || "Main",
    capacity: fd.get("capacity"),
  });
  if (parsed.id) {
    await db.diningTable.update({ where: { id: parsed.id }, data: { ...parsed, id: undefined } });
  } else {
    await db.diningTable.create({ data: { ...parsed, id: undefined, outletId: outlet.id } });
  }
  revalidatePath("/settings");
  revalidatePath("/billing");
  revalidatePath("/orders/live");
}

export async function deleteTable(fd: FormData) {
  const id = String(fd.get("id"));
  if (!id) return;
  await db.diningTable.delete({ where: { id } });
  revalidatePath("/settings");
  revalidatePath("/orders/live");
}

export async function setTaxInclusive(fd: FormData) {
  const outlet = await db.outlet.findFirstOrThrow();
  const enabled = fd.get("taxInclusive") === "on";
  const kdsEnabled = fd.get("kdsEnabled") === "on";
  await db.outlet.update({
    where: { id: outlet.id },
    data: { taxInclusive: enabled, kdsEnabled },
  });
  revalidatePath("/settings");
  revalidatePath("/billing");
  revalidatePath("/kds");
  revalidatePath("/", "layout");
}

export async function toggleStoreOpen() {
  const outlet = await db.outlet.findFirstOrThrow();
  await db.outlet.update({ where: { id: outlet.id }, data: { storeOpen: !outlet.storeOpen } });
  revalidatePath("/", "layout");
}
