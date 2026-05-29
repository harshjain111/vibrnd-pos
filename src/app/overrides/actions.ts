"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { logActivity } from "@/lib/audit";

export type OverrideAction = "DISCOUNT" | "VOID_LINE" | "REFUND" | "OTHER";

export async function requestOverride(input: {
  actionType: OverrideAction;
  context: Record<string, any>;
}) {
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const req = await db.overrideRequest.create({
    data: {
      actionType: input.actionType,
      contextJson: JSON.stringify(input.context),
      requestedById: user?.id,
      outletId: outlet.id,
    },
  });
  await logActivity({
    action: "CREATE",
    entity: "Outlet",
    entityId: req.id,
    summary: `Override requested: ${input.actionType}${input.context.summary ? ` · ${input.context.summary}` : ""}`,
    outletId: outlet.id,
  });
  revalidatePath("/overrides");
  return req.id;
}

const Decide = z.object({
  id: z.string(),
  approved: z.coerce.boolean(),
  resolution: z.string().optional(),
});

export async function decideOverride(fd: FormData) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const parsed = Decide.parse({
    id: fd.get("id"),
    approved: fd.get("approved") === "true" || fd.get("approved") === "on",
    resolution: fd.get("resolution") || undefined,
  });
  const req = await db.overrideRequest.findUnique({ where: { id: parsed.id } });
  if (!req || req.status !== "PENDING") return;

  await db.overrideRequest.update({
    where: { id: parsed.id },
    data: {
      status: parsed.approved ? "APPROVED" : "REJECTED",
      approvedById: user?.id,
      resolution: parsed.resolution,
      resolvedAt: new Date(),
    },
  });
  await logActivity({
    action: parsed.approved ? "ACCEPT" : "REJECT",
    entity: "Outlet",
    entityId: parsed.id,
    summary: `Override ${parsed.approved ? "approved" : "rejected"}: ${req.actionType}${parsed.resolution ? ` · ${parsed.resolution}` : ""}`,
    outletId: outlet.id,
  });
  revalidatePath("/overrides");
  revalidatePath("/logs");
}
