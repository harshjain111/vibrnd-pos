"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";

export async function markRead(fd: FormData) {
  const id = String(fd.get("id"));
  if (!id) return;
  await db.notification.update({ where: { id }, data: { read: true } });
  revalidatePath("/", "layout");
}

export async function markAllRead() {
  const outlet = await getActiveOutlet();
  await db.notification.updateMany({
    where: { outletId: outlet.id, read: false },
    data: { read: true },
  });
  revalidatePath("/", "layout");
}

export async function clearRead() {
  const outlet = await getActiveOutlet();
  await db.notification.deleteMany({
    where: { outletId: outlet.id, read: true },
  });
  revalidatePath("/", "layout");
}
