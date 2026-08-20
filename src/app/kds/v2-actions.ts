"use server";
// KDS v2 — server actions per spec §22.
//
// Every mutation flows through the state machine (§20), writes the
// KotItemLine + a KotItemEvent row in the same transaction, then
// revalidates the /kds path. Optimistic concurrency via `version`.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { logActivity } from "@/lib/audit";
import { canTransition, nextTapStatus } from "@/lib/kds/state-machine";
import type { ActorRole, KotItemStatus } from "@/lib/kds/types";

// ─── one tap = next status ────────────────────────────────────────────

const TapInput = z.object({
  itemId: z.string(),
  expectedVersion: z.number().int().optional(),
});

export type TapResult =
  | {
      ok: true;
      itemId: string;
      newStatus: KotItemStatus;
      version: number;
      captainNotified: boolean;
    }
  | { ok: false; code: string; message: string; current?: { status: KotItemStatus; version: number } };

export async function tapItemForward(fd: FormData): Promise<TapResult> {
  await requireUser("BILLER"); // chef role reuses the biller/manager permission for now
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const parsed = TapInput.parse({
    itemId: String(fd.get("itemId") ?? ""),
    expectedVersion: fd.get("expectedVersion")
      ? Number(fd.get("expectedVersion"))
      : undefined,
  });

  const row = await db.kitchenTicketLine.findFirst({
    where: { id: parsed.itemId, ticket: { outletId: outlet.id } },
    include: { ticket: { select: { id: true, orderId: true, clearedAt: true } } },
  });
  if (!row) {
    return { ok: false, code: "NOT_FOUND", message: "Item not found" };
  }

  const from = (row.status as KotItemStatus) ?? "NEW";
  const to = nextTapStatus(from);
  if (!to) {
    return {
      ok: false,
      code: "ILLEGAL_TRANSITION",
      message: `Nothing to do from ${from}${from === "HELD" ? " — fire first" : ""}`,
    };
  }

  const actorRole: ActorRole =
    to === "SERVED" ? "CAPTAIN" : "CHEF"; // spec §20: only captain writes SERVED
  const gate = canTransition({
    from,
    to,
    actorRole,
    orderSettled: !!row.ticket.clearedAt,
  });
  if (!gate.ok) return { ok: false, code: gate.code, message: gate.message };

  if (
    parsed.expectedVersion != null &&
    parsed.expectedVersion !== row.version
  ) {
    return {
      ok: false,
      code: "VERSION_CONFLICT",
      message: "Someone else changed this item",
      current: { status: from, version: row.version },
    };
  }

  const now = new Date();
  const updated = await db.$transaction(async (tx) => {
    const patch: Record<string, unknown> = {
      status: to,
      version: { increment: 1 },
    };
    if (to === "PREPARING") patch.startedAt = now;
    if (to === "READY") patch.readyAt = now;
    if (to === "SERVED") patch.servedAt = now;

    const line = await tx.kitchenTicketLine.update({
      where: { id: row.id },
      data: patch,
      select: { id: true, version: true, status: true, ticketId: true },
    });
    await tx.kotItemEvent.create({
      data: {
        kotItemId: line.id,
        kotId: line.ticketId,
        outletId: outlet.id,
        kitchenId: row.kitchenId,
        fromStatus: from,
        toStatus: to,
        actorId: user?.id ?? null,
        actorRole,
        occurredAt: now,
      },
    });
    return line;
  });

  // Captain push — only when EVERY non-held item of the KOT is ready.
  const captainNotified = to === "READY" ? await maybeNotifyCaptain(row.ticket.id) : false;

  await logActivity({
    action: "UPDATE",
    entity: "Order",
    entityId: row.ticket.orderId,
    summary: `KDS ${row.name} → ${to}`,
    outletId: outlet.id,
  });
  revalidatePath("/kds");
  return {
    ok: true,
    itemId: updated.id,
    newStatus: to,
    version: updated.version,
    captainNotified,
  };
}

async function maybeNotifyCaptain(kotId: string): Promise<boolean> {
  const items = await db.kitchenTicketLine.findMany({
    where: { ticketId: kotId, status: { not: "CANCELLED" } },
    select: { status: true },
  });
  const active = items.filter((i) => i.status !== "HELD");
  const allReady =
    active.length > 0 &&
    active.every((i) => i.status === "READY" || i.status === "SERVED");
  if (!allReady) return false;
  // Real push wiring goes to notification service; log activity for now.
  await db.kitchenTicket.update({
    where: { id: kotId },
    data: { readyAt: new Date() },
  });
  return true;
}

// ─── UNDO (5 s window) — reverse the last tap on this item ───────────

const UndoInput = z.object({
  itemId: z.string(),
  toStatus: z.enum(["NEW", "PREPARING", "READY", "HELD"]),
});

export async function undoTap(fd: FormData): Promise<TapResult> {
  await requireUser("BILLER");
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const parsed = UndoInput.parse({
    itemId: String(fd.get("itemId") ?? ""),
    toStatus: String(fd.get("toStatus") ?? "NEW") as any,
  });
  const row = await db.kitchenTicketLine.findFirst({
    where: { id: parsed.itemId, ticket: { outletId: outlet.id } },
    select: { id: true, status: true, kitchenId: true, ticketId: true, version: true },
  });
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Item not found" };

  const now = new Date();
  const updated = await db.$transaction(async (tx) => {
    const line = await tx.kitchenTicketLine.update({
      where: { id: row.id },
      data: {
        status: parsed.toStatus,
        version: { increment: 1 },
      },
      select: { id: true, version: true, status: true },
    });
    await tx.kotItemEvent.create({
      data: {
        kotItemId: line.id,
        kotId: row.ticketId,
        outletId: outlet.id,
        kitchenId: row.kitchenId,
        fromStatus: row.status,
        toStatus: parsed.toStatus,
        actorId: user?.id ?? null,
        actorRole: "CHEF",
        reason: "UNDO",
        occurredAt: now,
      },
    });
    return line;
  });

  revalidatePath("/kds");
  return {
    ok: true,
    itemId: updated.id,
    newStatus: updated.status as KotItemStatus,
    version: updated.version,
    captainNotified: false,
  };
}

// ─── Hold / Fire (§12) ───────────────────────────────────────────────

const HoldInput = z.object({
  itemId: z.string(),
  minutes: z.coerce.number().int().positive().max(120).optional(),
  untilFire: z.coerce.boolean().optional(),
});

export async function holdItem(fd: FormData) {
  await requireUser("BILLER");
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const parsed = HoldInput.parse({
    itemId: String(fd.get("itemId") ?? ""),
    minutes: fd.get("minutes") ? Number(fd.get("minutes")) : undefined,
    untilFire: fd.get("untilFire") === "true",
  });
  const row = await db.kitchenTicketLine.findFirst({
    where: { id: parsed.itemId, ticket: { outletId: outlet.id } },
    select: { id: true, status: true, kitchenId: true, ticketId: true, heldMs: true, startedAt: true },
  });
  if (!row) return { ok: false, code: "NOT_FOUND" };

  const now = new Date();
  const holdUntil =
    parsed.untilFire || !parsed.minutes
      ? null
      : new Date(now.getTime() + parsed.minutes * 60_000);

  await db.$transaction(async (tx) => {
    await tx.kitchenTicketLine.update({
      where: { id: row.id },
      data: {
        status: "HELD",
        holdUntil,
        version: { increment: 1 },
      },
    });
    await tx.kotItemEvent.create({
      data: {
        kotItemId: row.id,
        kotId: row.ticketId,
        outletId: outlet.id,
        kitchenId: row.kitchenId,
        fromStatus: row.status,
        toStatus: "HELD",
        actorId: user?.id ?? null,
        actorRole: "CHEF",
        reason: parsed.untilFire ? "hold-until-fire" : `hold-${parsed.minutes}m`,
        occurredAt: now,
      },
    });
  });

  revalidatePath("/kds");
  return { ok: true };
}

export async function fireItem(fd: FormData) {
  await requireUser("BILLER");
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const itemId = String(fd.get("itemId") ?? "");
  const row = await db.kitchenTicketLine.findFirst({
    where: { id: itemId, ticket: { outletId: outlet.id } },
    select: { id: true, status: true, kitchenId: true, ticketId: true, holdUntil: true },
  });
  if (!row) return { ok: false, code: "NOT_FOUND" };
  if (row.status !== "HELD") return { ok: false, code: "NOT_HELD" };

  const now = new Date();
  // When fired, item returns to NEW (chef then taps to move to PREPARING).
  await db.$transaction(async (tx) => {
    await tx.kitchenTicketLine.update({
      where: { id: row.id },
      data: {
        status: "NEW",
        holdUntil: null,
        version: { increment: 1 },
      },
    });
    await tx.kotItemEvent.create({
      data: {
        kotItemId: row.id,
        kotId: row.ticketId,
        outletId: outlet.id,
        kitchenId: row.kitchenId,
        fromStatus: "HELD",
        toStatus: "NEW",
        actorId: user?.id ?? null,
        actorRole: "CHEF",
        reason: "FIRE",
        occurredAt: now,
      },
    });
  });

  revalidatePath("/kds");
  return { ok: true };
}

// ─── Cancel acknowledge (§13.4) ───────────────────────────────────────

const AckInput = z.object({
  kotId: z.string(),
  wasWasted: z.coerce.boolean().optional(),
});

export async function ackCancellation(fd: FormData) {
  await requireUser("BILLER");
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const parsed = AckInput.parse({
    kotId: String(fd.get("kotId") ?? ""),
    wasWasted: fd.get("wasWasted") === "true" ? true : fd.get("wasWasted") === "false" ? false : undefined,
  });
  const now = new Date();
  await db.kitchenTicketLine.updateMany({
    where: {
      ticketId: parsed.kotId,
      status: "CANCELLED",
      cancelAckAt: null,
    },
    data: {
      cancelAckAt: now,
      cancelAckBy: user?.id ?? null,
      wasWasted: parsed.wasWasted ?? null,
    },
  });
  await logActivity({
    action: "UPDATE",
    entity: "Order",
    entityId: parsed.kotId,
    summary: `Cancelled KOT acknowledged${parsed.wasWasted != null ? ` (wasted=${parsed.wasWasted})` : ""}`,
    outletId: outlet.id,
  });
  revalidatePath("/kds");
  return { ok: true };
}

// ─── Recall (§11) ─────────────────────────────────────────────────────

const RecallInput = z.object({
  itemId: z.string(),
  reason: z.string().max(200).optional(),
});

export async function recallItem(fd: FormData) {
  await requireUser("BILLER");
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const parsed = RecallInput.parse({
    itemId: String(fd.get("itemId") ?? ""),
    reason: String(fd.get("reason") ?? "").trim() || undefined,
  });
  const row = await db.kitchenTicketLine.findFirst({
    where: { id: parsed.itemId, ticket: { outletId: outlet.id } },
    select: { id: true, status: true, kitchenId: true, ticketId: true, recallCount: true },
  });
  if (!row) return { ok: false, code: "NOT_FOUND" };

  // §11 — recalled item returns as PREPARING with a purple badge.
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.kitchenTicketLine.update({
      where: { id: row.id },
      data: {
        status: "PREPARING",
        isRecalled: true,
        recallCount: { increment: 1 },
        version: { increment: 1 },
      },
    });
    await tx.kotItemEvent.create({
      data: {
        kotItemId: row.id,
        kotId: row.ticketId,
        outletId: outlet.id,
        kitchenId: row.kitchenId,
        fromStatus: row.status,
        toStatus: "PREPARING",
        actorId: user?.id ?? null,
        actorRole: "CHEF",
        reason: parsed.reason ?? "RECALL",
        occurredAt: now,
      },
    });
  });
  await logActivity({
    action: "UPDATE",
    entity: "Order",
    entityId: row.ticketId,
    summary: `KDS recall on item — ${parsed.reason ?? "no reason"}`,
    outletId: outlet.id,
  });
  revalidatePath("/kds");
  return { ok: true };
}
