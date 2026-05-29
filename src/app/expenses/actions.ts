"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { logActivity } from "@/lib/audit";
import { inr } from "@/lib/utils";

const E = z.object({
  id: z.string().optional(),
  category: z.string().min(1),
  vendor: z.string().optional(),
  amount: z.coerce.number().positive(),
  paymentMode: z.string().default("CASH"),
  note: z.string().optional(),
});

export async function saveExpense(fd: FormData) {
  await requireUser("BILLER");
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const parsed = E.parse({
    id: fd.get("id") || undefined,
    category: fd.get("category"),
    vendor: fd.get("vendor") || undefined,
    amount: fd.get("amount"),
    paymentMode: fd.get("paymentMode") || "CASH",
    note: fd.get("note") || undefined,
  });

  if (parsed.id) {
    await db.expense.update({ where: { id: parsed.id }, data: { ...parsed, id: undefined } });
  } else {
    const exp = await db.expense.create({
      data: {
        ...parsed,
        id: undefined,
        outletId: outlet.id,
        createdById: user?.id,
        status: "PENDING_MANAGER",
      },
    });
    await logActivity({
      action: "CREATE",
      entity: "Expense",
      entityId: exp.id,
      summary: `Logged expense ${parsed.category} ${inr(parsed.amount)} — pending Manager approval`,
      outletId: outlet.id,
    });
  }
  revalidatePath("/expenses");
  revalidatePath("/logs");
}

export async function deleteExpense(fd: FormData) {
  await requireUser("MANAGER");
  const id = String(fd.get("id"));
  if (!id) return;
  await db.expense.delete({ where: { id } });
  revalidatePath("/expenses");
}

const ApproveInput = z.object({
  id: z.string(),
  asRole: z.enum(["MANAGER", "AUDITOR"]),
});

export async function approveExpense(fd: FormData) {
  const user = await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const parsed = ApproveInput.parse({
    id: fd.get("id"),
    asRole: fd.get("asRole"),
  });
  const exp = await db.expense.findUnique({ where: { id: parsed.id } });
  if (!exp) throw new Error("Expense not found");
  if (exp.status === "REJECTED") throw new Error("Expense was rejected — cannot approve");
  if (exp.status === "APPROVED") throw new Error("Expense already approved");

  if (parsed.asRole === "MANAGER") {
    if (exp.status !== "PENDING_MANAGER") throw new Error(`Manager can only approve PENDING_MANAGER (status: ${exp.status})`);
    if (exp.createdById && exp.createdById === user.id) throw new Error("You can't approve an expense you logged");
    await db.expense.update({
      where: { id: exp.id },
      data: {
        status: "PENDING_AUDITOR",
        managerApprovedById: user.id,
        managerApprovedAt: new Date(),
      },
    });
    await logActivity({
      action: "ACCEPT",
      entity: "Expense",
      entityId: exp.id,
      summary: `Manager approved expense ${exp.category} ${inr(exp.amount)} — now pending Auditor`,
      outletId: outlet.id,
    });
  } else {
    if (exp.status !== "PENDING_AUDITOR") throw new Error(`Auditor can only approve PENDING_AUDITOR (status: ${exp.status})`);
    if (exp.managerApprovedById === user.id) throw new Error("Auditor must be different from the Manager who approved it");
    if (exp.createdById && exp.createdById === user.id) throw new Error("You can't audit an expense you logged");
    await db.expense.update({
      where: { id: exp.id },
      data: {
        status: "APPROVED",
        auditorApprovedById: user.id,
        auditorApprovedAt: new Date(),
      },
    });
    await logActivity({
      action: "ACCEPT",
      entity: "Expense",
      entityId: exp.id,
      summary: `Auditor approved expense ${exp.category} ${inr(exp.amount)} — final approval`,
      outletId: outlet.id,
    });
  }

  revalidatePath("/expenses");
  revalidatePath("/logs");
}

const Reject = z.object({
  id: z.string(),
  reason: z.string().min(3),
});

export async function rejectExpense(fd: FormData) {
  const user = await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const parsed = Reject.parse({
    id: fd.get("id"),
    reason: fd.get("reason"),
  });
  const exp = await db.expense.findUnique({ where: { id: parsed.id } });
  if (!exp) throw new Error("Expense not found");
  if (exp.status === "REJECTED") return;

  await db.expense.update({
    where: { id: parsed.id },
    data: {
      status: "REJECTED",
      rejectedById: user.id,
      rejectedAt: new Date(),
      rejectionReason: parsed.reason,
      ownerFlagged: true,
    },
  });

  // Surface to the owner
  await db.notification.create({
    data: {
      outletId: outlet.id,
      kind: "INFO",
      title: `Expense rejected — Owner attention`,
      body: `${exp.category} ${inr(exp.amount)} rejected by ${user.name}: ${parsed.reason}`,
      link: "/expenses?filter=rejected",
    },
  });

  await logActivity({
    action: "REJECT",
    entity: "Expense",
    entityId: exp.id,
    summary: `Rejected expense ${exp.category} ${inr(exp.amount)} — reason: ${parsed.reason} · flagged to Owner`,
    outletId: outlet.id,
  });

  revalidatePath("/expenses");
  revalidatePath("/logs");
  revalidatePath("/notifications");
}

export async function clearOwnerFlag(fd: FormData) {
  await requireUser("OWNER");
  const id = String(fd.get("id"));
  await db.expense.update({ where: { id }, data: { ownerFlagged: false } });
  revalidatePath("/expenses");
}
