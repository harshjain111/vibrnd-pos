"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { logActivity } from "@/lib/audit";
import { inr } from "@/lib/utils";

const Issue = z.object({
  code: z.string().min(3).max(32).transform((s) => s.toUpperCase().trim()),
  amount: z.coerce.number().positive(),
  customerPhone: z.string().optional(),
  expiresAt: z.string().optional(),
});

export async function issueGiftCard(_state: { error?: string } | null, fd: FormData): Promise<{ error?: string }> {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  let parsed: z.infer<typeof Issue>;
  try {
    parsed = Issue.parse({
      code: fd.get("code"),
      amount: fd.get("amount"),
      customerPhone: fd.get("customerPhone") || undefined,
      expiresAt: fd.get("expiresAt") || undefined,
    });
  } catch {
    return { error: "Invalid input." };
  }
  const exists = await db.giftCard.findUnique({ where: { code: parsed.code } });
  if (exists) return { error: "Code already exists." };

  let customerId: string | undefined;
  if (parsed.customerPhone) {
    const c = await db.customer.findFirst({
      where: { id: `cust-${parsed.customerPhone}`, outletId: outlet.id },
    });
    if (c) customerId = c.id;
  }

  const card = await db.giftCard.create({
    data: {
      code: parsed.code,
      balance: parsed.amount,
      initialAmount: parsed.amount,
      outletId: outlet.id,
      customerId,
      expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
      txns: {
        create: {
          kind: "ISSUE",
          amount: parsed.amount,
          actor: user?.email ?? "system",
        },
      },
    },
  });

  await logActivity({
    action: "CREATE",
    entity: "Customer",
    entityId: card.id,
    summary: `Issued gift card ${card.code} for ${inr(parsed.amount)}${customerId ? ` to customer` : ""}`,
    outletId: outlet.id,
  });

  revalidatePath("/gift-cards");
  revalidatePath("/logs");
  return {};
}

export async function topUpGiftCard(fd: FormData) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const id = String(fd.get("id"));
  const amount = Number(fd.get("amount"));
  if (!id || !(amount > 0)) return;
  const card = await db.giftCard.findUnique({ where: { id } });
  if (!card) return;
  await db.giftCard.update({
    where: { id },
    data: {
      balance: { increment: amount },
      txns: { create: { kind: "TOP_UP", amount, actor: user?.email ?? "system" } },
    },
  });
  await logActivity({
    action: "UPDATE",
    entity: "Customer",
    entityId: id,
    summary: `Topped up ${card.code} by ${inr(amount)}`,
    outletId: outlet.id,
  });
  revalidatePath("/gift-cards");
  revalidatePath(`/gift-cards/${id}`);
}

export async function deactivateGiftCard(fd: FormData) {
  await requireUser("MANAGER");
  const id = String(fd.get("id"));
  const card = await db.giftCard.findUnique({ where: { id } });
  if (!card) return;
  await db.giftCard.update({ where: { id }, data: { active: !card.active } });
  revalidatePath("/gift-cards");
}

/** Server lookup used by billing screen — returns balance + validity */
export async function lookupGiftCard(code: string) {
  const c = code.toUpperCase().trim();
  if (!c) return null;
  const outlet = await getActiveOutlet();
  const card = await db.giftCard.findFirst({ where: { code: c, outletId: outlet.id } });
  if (!card) return { error: "Card not found" } as const;
  if (!card.active) return { error: "Card is inactive" } as const;
  if (card.expiresAt && card.expiresAt.getTime() < Date.now()) return { error: "Card expired" } as const;
  if (card.balance <= 0) return { error: "No balance left on card" } as const;
  return { id: card.id, code: card.code, balance: card.balance };
}
