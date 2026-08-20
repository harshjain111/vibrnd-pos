// KDS v2 — server-side loader. Hydrates KotSnapshot[] from Prisma so
// the pure buildBoard() from board.ts can group them into tiles.
//
// Query strategy: fetch every KOT with at least one live item routed to
// the requested kitchen, plus its captain name. Cleared/settled KOTs
// are handled by /kds/history separately (§14, §15).

import "server-only";
import { db } from "@/lib/db";
import { buildBoard } from "./board";
import { parseComments } from "./comments";
import type {
  Board,
  KotItemSnapshot,
  KotSnapshot,
  ServiceMode,
} from "./types";

export type LoadBoardArgs = {
  outletId: string;
  kitchenId: string;
};

/** One call from a page component. Returns the four-column Board plus
 *  the CANCELLED alert tickets pinned above NEW (§13). */
export async function loadBoard({ outletId, kitchenId }: LoadBoardArgs): Promise<{
  board: Board;
  cancelledAlerts: CancelledAlert[];
  serverTime: string;
}> {
  // Live KOTs — hasn't been cleared, and at least one item in this
  // kitchen is not in a terminal state (SERVED or CANCELLED with ack).
  const rows = await db.kitchenTicket.findMany({
    where: {
      outletId,
      clearedAt: null,
      lines: {
        some: {
          kitchenId,
          status: { in: ["NEW", "HELD", "PREPARING", "READY", "SERVED"] },
        },
      },
    },
    include: {
      lines: {
        where: { kitchenId },
        orderBy: { updatedAt: "asc" },
      },
      order: {
        select: {
          table: { select: { name: true } },
          captain: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const snapshots: KotSnapshot[] = rows.map((k) => ({
    id: k.id,
    kotNo: k.kotNo,
    orderId: k.orderId,
    serviceMode: (k.serviceMode as ServiceMode | null) ?? null,
    tableLabel: k.tableLabel ?? k.order.table?.name ?? null,
    tokenNo: k.tokenNo,
    guestCount: k.guestCount,
    captainId: k.captainId,
    captainName: k.order.captain?.name ?? null,
    isRush: k.isRush,
    kotNote: k.kotNote ?? k.notes ?? null,
    allergyNote: k.allergyNote,
    punchedAt: (k.punchedAt ?? k.createdAt).toISOString(),
    clearedAt: k.clearedAt?.toISOString() ?? null,
    clearedReason: (k.clearedReason as KotSnapshot["clearedReason"]) ?? null,
    items: k.lines.map<KotItemSnapshot>((l) => ({
      id: l.id,
      name: l.name,
      qty: l.qty,
      qtyReady: l.qtyReady,
      portion: l.portion,
      isVeg: l.isVeg,
      comments: parseComments(l.comments),
      commentKey: l.commentKey,
      kitchenId: l.kitchenId ?? "",
      prepMinutes: l.prepMinutes,
      status: (l.status as KotItemSnapshot["status"]) ?? "NEW",
      holdUntil: l.holdUntil?.toISOString() ?? null,
      heldMs: Number(l.heldMs ?? 0),
      startedAt: l.startedAt?.toISOString() ?? null,
      readyAt: l.readyAt?.toISOString() ?? null,
      servedAt: l.servedAt?.toISOString() ?? null,
      cancelledAt: l.cancelledAt?.toISOString() ?? null,
      cancelReason: l.cancelReason,
      allergyAckAt: l.allergyAckAt?.toISOString() ?? null,
      isRecalled: l.isRecalled,
      version: l.version,
    })),
  }));

  const board = buildBoard(snapshots, kitchenId);

  // Cancelled alert tickets — items cancelled but not yet acknowledged.
  // Pinned first in the NEW column by the UI layer.
  const cancelled = await db.kitchenTicketLine.findMany({
    where: {
      kitchenId,
      status: "CANCELLED",
      cancelAckAt: null,
    },
    include: {
      ticket: {
        select: {
          id: true,
          kotNo: true,
          tableLabel: true,
          order: { select: { table: { select: { name: true } } } },
        },
      },
    },
    orderBy: { cancelledAt: "desc" },
  });

  const cancelledAlerts: CancelledAlert[] = groupCancelled(cancelled);

  return {
    board,
    cancelledAlerts,
    serverTime: new Date().toISOString(),
  };
}

// ─── cancelled alert tickets (§13) ────────────────────────────────────

export type CancelledAlert = {
  kotId: string;
  kotNo: string;
  tableLabel: string | null;
  cancelledBy: string | null;
  cancelledAt: string;
  reason: string | null;
  items: {
    itemId: string;
    name: string;
    comments: ReturnType<typeof parseComments>;
    priorStatus: string | null;
  }[];
};

type CancelledRow = Awaited<
  ReturnType<typeof db.kitchenTicketLine.findMany<{
    include: {
      ticket: {
        select: {
          id: true;
          kotNo: true;
          tableLabel: true;
          order: { select: { table: { select: { name: true } } } };
        };
      };
    };
  }>>
>[number];

function groupCancelled(rows: CancelledRow[]): CancelledAlert[] {
  const byKot = new Map<string, CancelledAlert>();
  for (const r of rows) {
    const key = r.ticket.id;
    const alert = byKot.get(key) ?? {
      kotId: r.ticket.id,
      kotNo: r.ticket.kotNo,
      tableLabel: r.ticket.tableLabel ?? r.ticket.order.table?.name ?? null,
      cancelledBy: r.cancelledBy,
      cancelledAt: (r.cancelledAt ?? new Date()).toISOString(),
      reason: r.cancelReason,
      items: [],
    };
    alert.items.push({
      itemId: r.id,
      name: r.name,
      comments: parseComments(r.comments),
      // "Was PREPARING" vs "Was NEW" (§13). We store the prior status in
      // the event log; for now, use started_at to guess.
      priorStatus: r.startedAt ? "PREPARING" : "NEW",
    });
    byKot.set(key, alert);
  }
  return Array.from(byKot.values());
}

// ─── Kitchen picker helper ────────────────────────────────────────────

/** Returns the outlet's kitchens for the dropdown. Auto-creates a
 *  default "MAIN" kitchen on first read if the outlet has none. */
export async function ensureKitchens(outletId: string) {
  const list = await db.kitchen.findMany({
    where: { outletId, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  if (list.length > 0) return list;
  await db.kitchen.create({
    data: { outletId, code: "MAIN", name: "Main Kitchen", sortOrder: 0 },
  });
  return db.kitchen.findMany({
    where: { outletId, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}
