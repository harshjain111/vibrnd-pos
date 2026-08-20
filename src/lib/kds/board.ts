// KDS v2 — pure column grouping / splitting. Zero I/O.
//
// Splitting is display logic, not data (§9 S11 + §21.1). One KOT with
// three items in three different statuses produces three tiles across
// three columns; the DB still has exactly one KOT row and one row per
// item.

import type {
  Board,
  BoardColumn,
  KotItemSnapshot,
  KotSnapshot,
  Tile,
} from "./types";

const EMPTY_COLUMN = "NEW" satisfies BoardColumn; // fallback for edge cases

/**
 * Group each KOT's items into per-column tiles.
 *
 * Rules honoured verbatim from spec §9:
 *   S1  One tile per column per KOT (zero items ⇒ no tile there).
 *   S2  Each split tile carries only its own items.
 *   S3  KOT no, table, captain and timer are identical on every part.
 *   S4  SPLIT n/m badge on every part when the KOT is split.
 *   S5  Every split tile carries a link bar with plain-language text.
 *   S6  Merge is automatic — one status ⇒ isSplit = false.
 *   S7  Captain is called only when every non-held item is Ready.
 *   S9  HELD items ride inside NEW; they never create a split.
 *  S11  Nothing about grouping touches the DB — this is display logic.
 */
export function buildBoard(kots: KotSnapshot[], kitchenId: string): Board {
  const cols: Board = { NEW: [], PREPARING: [], READY: [], SERVED: [] };

  for (const kot of kots) {
    // Only items routed to THIS kitchen exist for THIS board.
    const mine = kot.items.filter((i) => i.kitchenId === kitchenId);
    // Cancelled items never render on live columns — they land on the
    // dedicated CANCELLED ticket (§13) which we handle separately.
    const live = mine.filter((i) => i.status !== "CANCELLED");
    if (live.length === 0) continue;

    // Group live items by their display column. HELD rides inside NEW
    // (§9 S9) — never creates a split badge.
    const groups = new Map<BoardColumn, KotItemSnapshot[]>();
    for (const item of live) {
      const col: BoardColumn = item.status === "HELD"
        ? "NEW"
        : (item.status as BoardColumn);
      const list = groups.get(col) ?? [];
      list.push(item);
      groups.set(col, list);
    }

    // Non-held item count decides "final ready" and drives the split
    // badge count. Held items are excluded so a 15-min hold doesn't make
    // a ticket look infinitely late (§7.3, §9 S9).
    const nonHeld = live.filter((i) => i.status !== "HELD");
    const activeReady = nonHeld.every(
      (i) => i.status === "READY" || i.status === "SERVED",
    );
    const isFinalReady = nonHeld.length > 0 && activeReady;

    // Total held ms — used by every tile of this KOT so the ticket timer
    // reads identically across all parts.
    const heldMs = live.reduce((s, i) => s + Number(i.heldMs || 0), 0);

    const activePartCount = countActiveParts(groups);
    const isSplit = activePartCount > 1;

    for (const [col, items] of groups) {
      const readyPart = col === "READY";
      const waitingForOthers = readyPart && !isFinalReady;
      const tile: Tile = {
        kotId: kot.id,
        kotNo: kot.kotNo,
        column: col,
        items,
        timerFrom: kot.punchedAt, // §9 S3 — identical on every part
        heldMs,
        isSplit,
        splitLabel: isSplit
          ? `SPLIT ${items.length}/${nonHeld.length}`
          : undefined,
        linkText: isSplit ? describeOthers(groups, col, nonHeld.length) : undefined,
        waitingForOthers,
        isFinalReady: readyPart && isFinalReady,
        serviceMode: kot.serviceMode,
        tableLabel: kot.tableLabel,
        tokenNo: kot.tokenNo,
        captainName: kot.captainName,
        guestCount: kot.guestCount,
        isRush: kot.isRush,
        kotNote: kot.kotNote,
        allergyNote: kot.allergyNote,
      };
      cols[col].push(tile);
    }
  }

  // Sort every column per §4.3: late first, then RUSH, then oldest.
  // Held tiles pin last, cancelled tickets are pinned first (handled at
  // the alert-ticket layer, not here). Ready column extra rule: waiting-
  // for-others tiles sort AFTER final-ready ones so the chef sees "yes
  // captain has been pushed" first.
  return {
    NEW: sortLiveColumn(cols.NEW),
    PREPARING: sortLiveColumn(cols.PREPARING),
    READY: sortReadyColumn(cols.READY),
    SERVED: sortServed(cols.SERVED),
  };
}

// ─── helpers ──────────────────────────────────────────────────────────

function countActiveParts(
  groups: Map<BoardColumn, KotItemSnapshot[]>,
): number {
  // NEW-part items may include HELD (which fold into NEW) — we still
  // count NEW as one active part if at least one non-HELD item is there.
  let count = 0;
  for (const [col, items] of groups) {
    if (col === "NEW") {
      if (items.some((i) => i.status === "NEW")) count++;
    } else if (col !== "SERVED") {
      count++;
    }
  }
  return count;
}

function describeOthers(
  groups: Map<BoardColumn, KotItemSnapshot[]>,
  self: BoardColumn,
  totalLive: number,
): string {
  const parts: string[] = [];
  const nSelf = groups.get(self)?.filter((i) => i.status !== "HELD").length ?? 0;
  const remaining = totalLive - nSelf;

  const nInNew = (groups.get("NEW") ?? []).filter((i) => i.status === "NEW").length;
  const nPreparing = groups.get("PREPARING")?.length ?? 0;
  const nReady = groups.get("READY")?.length ?? 0;
  if (self !== "NEW" && nInNew > 0) {
    parts.push(`${nInNew} item${nInNew === 1 ? "" : "s"} still in NEW`);
  }
  if (self !== "PREPARING" && nPreparing > 0) {
    parts.push(`${nPreparing} preparing`);
  }
  if (self !== "READY" && nReady > 0) {
    parts.push(`${nReady} ready`);
  }
  if (parts.length === 0) {
    return `${remaining} elsewhere`;
  }
  return parts.join(" · ");
}

function sortLiveColumn(tiles: Tile[]): Tile[] {
  // Late first (largest elapsed vs target), then RUSH, then oldest first.
  // For pure grouping we can't compute "late" without target — the UI
  // layer resorts by observed elapsed at render time. Here we do a
  // stable base sort: RUSH first, then oldest punchedAt first.
  return tiles.slice().sort((a, b) => {
    if (a.isRush !== b.isRush) return a.isRush ? -1 : 1;
    return timerFromMs(a) - timerFromMs(b);
  });
}

function sortReadyColumn(tiles: Tile[]): Tile[] {
  // Final-ready tiles first (captain has been pushed); "waiting" tiles
  // last within Ready. Same secondary sort as live columns.
  return tiles.slice().sort((a, b) => {
    if (a.waitingForOthers !== b.waitingForOthers) {
      return a.waitingForOthers ? 1 : -1;
    }
    if (a.isRush !== b.isRush) return a.isRush ? -1 : 1;
    return timerFromMs(a) - timerFromMs(b);
  });
}

function sortServed(tiles: Tile[]): Tile[] {
  // Newest served first — chef scanning "did I just serve that?"
  return tiles.slice().sort((a, b) => {
    const aT = mostRecentServedAt(a);
    const bT = mostRecentServedAt(b);
    return bT - aT;
  });
}

function timerFromMs(t: Tile): number {
  const ms = Date.parse(t.timerFrom);
  return Number.isFinite(ms) ? ms : 0;
}

function mostRecentServedAt(t: Tile): number {
  let max = 0;
  for (const i of t.items) {
    if (i.servedAt) {
      const p = Date.parse(i.servedAt);
      if (p > max) max = p;
    }
  }
  return max || timerFromMs(t);
}
