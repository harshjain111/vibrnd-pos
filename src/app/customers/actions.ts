"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";

const C = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  gstin: z.string().optional(),
  tags: z.string().optional(),
});

export async function saveCustomer(fd: FormData) {
  const outlet = await getActiveOutlet();
  const parsed = C.parse({
    id: fd.get("id") || undefined,
    name: fd.get("name"),
    phone: fd.get("phone") || undefined,
    email: fd.get("email") || undefined,
    address: fd.get("address") || undefined,
    gstin: fd.get("gstin") || undefined,
    tags: fd.get("tags") || undefined,
  });

  if (parsed.id) {
    await db.customer.update({ where: { id: parsed.id }, data: { ...parsed, id: undefined } });
  } else {
    await db.customer.create({ data: { ...parsed, id: undefined, outletId: outlet.id } });
  }
  revalidatePath("/customers");
}
