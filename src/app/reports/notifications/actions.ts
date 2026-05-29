"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { logActivity } from "@/lib/audit";

const Save = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  slug: z.string().min(1),
  recipients: z.string().min(3),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).default("DAILY"),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  dayOfWeek: z.string().optional(),
  dayOfMonth: z.coerce.number().int().min(1).max(28).optional(),
  format: z.enum(["EXCEL", "PDF", "BOTH"]).default("EXCEL"),
  subject: z.string().optional(),
  dateRange: z.enum(["YESTERDAY", "LAST_7", "THIS_MONTH", "LAST_MONTH", "ROLLING_N"]).default("YESTERDAY"),
  rollingDays: z.coerce.number().int().positive().optional(),
});

export async function saveNotification(fd: FormData) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const p = Save.parse({
    id: fd.get("id") || undefined,
    name: fd.get("name"),
    slug: fd.get("slug"),
    recipients: String(fd.get("recipients") || "")
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(","),
    status: fd.get("status") || "ACTIVE",
    frequency: fd.get("frequency") || "DAILY",
    time: fd.get("time") || "08:00",
    dayOfWeek: fd.get("dayOfWeek") || undefined,
    dayOfMonth: fd.get("dayOfMonth") || undefined,
    format: fd.get("format") || "EXCEL",
    subject: fd.get("subject") || undefined,
    dateRange: fd.get("dateRange") || "YESTERDAY",
    rollingDays: fd.get("rollingDays") || undefined,
  });

  if (p.id) {
    await db.reportNotification.update({
      where: { id: p.id },
      data: { ...p, id: undefined },
    });
  } else {
    await db.reportNotification.create({
      data: { ...p, id: undefined, outletId: outlet.id, createdById: user?.id ?? null },
    });
  }
  await logActivity({
    action: p.id ? "UPDATE" : "CREATE",
    entity: "ReportNotification" as any,
    summary: `${p.id ? "Updated" : "Scheduled"} ${p.name} → ${p.recipients} (${p.frequency} ${p.time})`,
    outletId: outlet.id,
  });
  revalidatePath("/reports/notifications");
  redirect("/reports/notifications");
}

export async function deleteNotification(fd: FormData) {
  await requireUser("MANAGER");
  const id = String(fd.get("id") || "");
  if (!id) return;
  await db.reportNotification.delete({ where: { id } });
  revalidatePath("/reports/notifications");
}

export async function toggleStatus(fd: FormData) {
  await requireUser("MANAGER");
  const id = String(fd.get("id") || "");
  if (!id) return;
  const cur = await db.reportNotification.findUnique({ where: { id } });
  if (!cur) return;
  await db.reportNotification.update({
    where: { id },
    data: { status: cur.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
  });
  revalidatePath("/reports/notifications");
}

/** Simulate sending a scheduled notification — logs a row to the history table. */
export async function sendNow(fd: FormData) {
  await requireUser("MANAGER");
  const id = String(fd.get("id") || "");
  if (!id) return;
  const n = await db.reportNotification.findUnique({ where: { id } });
  if (!n) return;
  const today = new Date();
  let from: Date;
  let to: Date = today;
  switch (n.dateRange) {
    case "YESTERDAY": {
      from = new Date(today.getTime() - 86400000);
      from.setHours(0, 0, 0, 0);
      to = new Date(from);
      to.setHours(23, 59, 59, 999);
      break;
    }
    case "LAST_7":
      from = new Date(today.getTime() - 7 * 86400000);
      break;
    case "THIS_MONTH":
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case "LAST_MONTH":
      from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      to = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
      break;
    case "ROLLING_N":
      from = new Date(today.getTime() - (n.rollingDays ?? 30) * 86400000);
      break;
    default:
      from = today;
  }
  await db.reportNotificationLog.create({
    data: {
      notificationId: n.id,
      status: "OK",
      resolvedFrom: from,
      resolvedTo: to,
    },
  });
  revalidatePath("/reports/notifications");
}
