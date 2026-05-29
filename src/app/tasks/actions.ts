"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { logActivity } from "@/lib/audit";

const CreateTask = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["ADHOC", "TODO"]).default("ADHOC"),
  assignedRole: z.enum(["OWNER", "MANAGER", "BILLER", "CAPTAIN"]).optional(),
  assignedToId: z.string().optional(),
  dueAt: z.string().optional(),
});

export async function createTask(fd: FormData) {
  await requireUser("BILLER");
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const parsed = CreateTask.parse({
    title: fd.get("title"),
    description: fd.get("description") || undefined,
    type: fd.get("type") || "ADHOC",
    assignedRole: fd.get("assignedRole") || undefined,
    assignedToId: fd.get("assignedToId") || undefined,
    dueAt: fd.get("dueAt") || undefined,
  });
  const task = await db.task.create({
    data: {
      title: parsed.title,
      description: parsed.description,
      type: parsed.type,
      assignedRole: parsed.assignedRole,
      assignedToId: parsed.assignedToId,
      dueAt: parsed.dueAt ? new Date(parsed.dueAt) : null,
      createdById: user?.id,
      outletId: outlet.id,
    },
  });
  await logActivity({
    action: "CREATE",
    entity: "Outlet",
    entityId: task.id,
    summary: `Created task "${parsed.title}"${parsed.assignedRole ? ` for ${parsed.assignedRole}` : ""}`,
    outletId: outlet.id,
  });
  revalidatePath("/tasks");
}

export async function completeTask(fd: FormData) {
  await requireUser("BILLER");
  const outlet = await getActiveOutlet();
  const id = String(fd.get("id"));
  const t = await db.task.findUnique({ where: { id } });
  if (!t) return;
  await db.task.update({
    where: { id },
    data: { status: "DONE", completedAt: new Date() },
  });
  await logActivity({
    action: "UPDATE",
    entity: "Outlet",
    entityId: id,
    summary: `Completed task "${t.title}"`,
    outletId: outlet.id,
  });
  revalidatePath("/tasks");
}

export async function deleteTask(fd: FormData) {
  await requireUser("MANAGER");
  const id = String(fd.get("id"));
  await db.task.delete({ where: { id } });
  revalidatePath("/tasks");
}

/** Generate today's recurring duties (idempotent: skips if already generated today). */
export async function ensureDailyDuties() {
  const outlet = await getActiveOutlet();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const templates = await db.taskTemplate.findMany({
    where: { outletId: outlet.id, active: true, type: "RECURRING", cadence: "DAILY" },
  });
  for (const tpl of templates) {
    const existing = await db.task.findFirst({
      where: { templateId: tpl.id, outletId: outlet.id, createdAt: { gte: today } },
    });
    if (existing) continue;
    const dueAt = new Date(today);
    dueAt.setHours(23, 30, 0, 0);
    await db.task.create({
      data: {
        title: tpl.title,
        description: tpl.description,
        type: "RECURRING",
        templateId: tpl.id,
        assignedRole: tpl.defaultRole,
        dueAt,
        outletId: outlet.id,
      },
    });
  }
  // Mark templates' lastRunAt
  for (const tpl of templates) {
    await db.taskTemplate.update({ where: { id: tpl.id }, data: { lastRunAt: new Date() } });
  }
}

const TemplateInput = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  cadence: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).default("DAILY"),
  defaultRole: z.enum(["OWNER", "MANAGER", "BILLER", "CAPTAIN"]).optional(),
  slaMinutes: z.coerce.number().int().nonnegative().optional(),
  active: z.coerce.boolean().default(true),
});

export async function saveTemplate(fd: FormData) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const parsed = TemplateInput.parse({
    id: fd.get("id") || undefined,
    title: fd.get("title"),
    description: fd.get("description") || undefined,
    cadence: fd.get("cadence") || "DAILY",
    defaultRole: fd.get("defaultRole") || undefined,
    slaMinutes: fd.get("slaMinutes") || undefined,
    active: fd.get("active") === "on",
  });
  if (parsed.id) {
    await db.taskTemplate.update({
      where: { id: parsed.id },
      data: { ...parsed, type: "RECURRING", id: undefined },
    });
  } else {
    await db.taskTemplate.create({
      data: { ...parsed, type: "RECURRING", id: undefined, outletId: outlet.id },
    });
  }
  revalidatePath("/tasks");
}

export async function deleteTemplate(fd: FormData) {
  await requireUser("MANAGER");
  const id = String(fd.get("id"));
  await db.taskTemplate.delete({ where: { id } });
  revalidatePath("/tasks");
}
