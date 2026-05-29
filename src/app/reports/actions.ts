"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { requireUser } from "@/lib/rbac";

export async function toggleFavourite(fd: FormData) {
  await requireUser("MANAGER");
  const user = await getSessionUser();
  if (!user) return;
  const slug = String(fd.get("slug") || "");
  if (!slug) return;
  const existing = await db.reportFavourite.findUnique({
    where: { userId_slug: { userId: user.id, slug } },
  });
  if (existing) {
    await db.reportFavourite.delete({ where: { id: existing.id } });
  } else {
    await db.reportFavourite.create({ data: { userId: user.id, slug } });
  }
  revalidatePath("/reports");
}
