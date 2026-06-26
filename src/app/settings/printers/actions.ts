"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";

const P = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(60),
  /** Kitchen station / department this printer serves. */
  station: z.string().min(1).max(40),
  /** Optional device target for the local print agent. */
  target: z.string().max(120).optional(),
  active: z.coerce.boolean().default(true),
});

export async function savePrinter(fd: FormData) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const parsed = P.parse({
    id: fd.get("id") || undefined,
    name: fd.get("name"),
    station: fd.get("station"),
    target: (fd.get("target") as string) || undefined,
    active: fd.get("active") === "on",
  });
  const data = {
    name: parsed.name.trim(),
    station: parsed.station.trim().toUpperCase(),
    target: parsed.target?.trim() || null,
    active: parsed.active,
  };
  if (parsed.id) {
    await db.printer.update({ where: { id: parsed.id }, data });
  } else {
    await db.printer.create({ data: { ...data, outletId: outlet.id } });
  }
  revalidatePath("/settings/printers");
}

export async function deletePrinter(fd: FormData) {
  await requireUser("MANAGER");
  const id = String(fd.get("id"));
  if (!id) return;
  const outlet = await getActiveOutlet();
  await db.printer.deleteMany({ where: { id, outletId: outlet.id } });
  revalidatePath("/settings/printers");
}
