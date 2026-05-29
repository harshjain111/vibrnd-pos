"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { getSessionUser } from "@/lib/session";
import { logActivity } from "@/lib/audit";
import { inr } from "@/lib/utils";

const E = z.object({
  kind: z.enum(["OPENING", "TOP_UP", "WITHDRAWAL"]),
  amount: z.coerce.number().positive(),
  reason: z.string().optional(),
});

export async function saveCashEntry(fd: FormData) {
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const parsed = E.parse({
    kind: fd.get("kind"),
    amount: fd.get("amount"),
    reason: fd.get("reason") || undefined,
  });
  const entry = await db.cashEntry.create({
    data: { ...parsed, outletId: outlet.id, actor: user?.email ?? "system" },
  });
  await logActivity({
    action: "CREATE",
    entity: "Expense",
    entityId: entry.id,
    summary: `${parsed.kind} ${inr(parsed.amount)}${parsed.reason ? ` · ${parsed.reason}` : ""}`,
    outletId: outlet.id,
  });
  revalidatePath("/cash");
  revalidatePath("/day-end");
  revalidatePath("/day-end/[date]", "page");
  revalidatePath("/logs");
}

export async function deleteCashEntry(fd: FormData) {
  const id = String(fd.get("id"));
  if (!id) return;
  await db.cashEntry.delete({ where: { id } });
  revalidatePath("/cash");
  revalidatePath("/day-end");
}
