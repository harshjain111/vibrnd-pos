// KDS v2 — shared types + fixed vocabulary.
// Zero I/O. Everything the pure engines (splitting, rendering, state
// machine) need lives here. Spec §2, §7, §20, §21.

export const KOT_ITEM_STATUSES = [
  "NEW",
  "HELD",
  "PREPARING",
  "READY",
  "SERVED",
  "CANCELLED",
] as const;
export type KotItemStatus = (typeof KOT_ITEM_STATUSES)[number];

/** Spec §20 status rank — a lower rank can never overwrite a higher one
 *  during offline replay. Recall is the only downgrade and carries an
 *  explicit force flag (§23.1). */
export const STATUS_RANK: Record<KotItemStatus, number> = {
  NEW: 1,
  HELD: 1,
  PREPARING: 2,
  READY: 3,
  SERVED: 4,
  CANCELLED: 4,
};

/** Comments (§6). Ordered array on each item, rendered verbatim. */
export type CommentType = "MODIFIER" | "ADDON" | "REMOVE" | "NOTE";
export type Comment = {
  type: CommentType;
  text: string;
  qty?: number;
};

/** Board column identity. Spec §4.1. */
export const BOARD_COLUMNS = ["NEW", "PREPARING", "READY", "SERVED"] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export type ServiceMode = "DINE_IN" | "TAKEAWAY" | "DELIVERY";

/** The event log's actor role (§21). */
export type ActorRole = "CAPTAIN" | "CHEF" | "CASHIER" | "MANAGER" | "SYSTEM";

/** Reason a KOT left the board (§21). */
export type ClearedReason = "BUMPED" | "SETTLED" | "CANCELLED";

// ─── snapshot shapes ──────────────────────────────────────────────────

/** One row on a tile as the server delivers it. Timestamps are ISO
 *  strings so this can travel through JSON boundaries unchanged. */
export type KotItemSnapshot = {
  id: string;
  name: string;
  qty: number;
  qtyReady: number;
  portion: string | null;
  isVeg: boolean;
  comments: Comment[];
  commentKey: string;
  kitchenId: string;
  prepMinutes: number;
  status: KotItemStatus;
  holdUntil: string | null;
  heldMs: number;
  startedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  allergyAckAt: string | null;
  isRecalled: boolean;
  version: number;
};

/** One KOT snapshot. `punchedAt` is the timer origin and is identical on
 *  every split part of the same KOT (§9 S3). */
export type KotSnapshot = {
  id: string;
  kotNo: string;
  orderId: string;
  serviceMode: ServiceMode | null;
  tableLabel: string | null;
  tokenNo: string | null;
  guestCount: number | null;
  captainId: string | null;
  captainName: string | null;
  isRush: boolean;
  kotNote: string | null;
  allergyNote: string | null;
  punchedAt: string;
  clearedAt: string | null;
  clearedReason: ClearedReason | null;
  items: KotItemSnapshot[];
};

/** A rendered tile — the result of grouping a KOT's items by column. A
 *  single KOT with items in different statuses produces multiple tiles
 *  (§9 S1). */
export type Tile = {
  kotId: string;
  kotNo: string;
  column: BoardColumn;
  items: KotItemSnapshot[];
  timerFrom: string; // = KOT.punchedAt
  heldMs: number; // total held time across this KOT's items so far
  isSplit: boolean;
  /** SPLIT n/m — n items on this tile, m items across the whole KOT
   *  in this kitchen. Present only when isSplit is true. */
  splitLabel?: string;
  /** Human-readable pointer to the other parts, e.g. "2 items still in
   *  NEW · 1 preparing". Present only when isSplit is true. */
  linkText?: string;
  /** True on Ready tiles when other items of the KOT are still cooking —
   *  the captain isn't pushed yet (§9 S7). */
  waitingForOthers: boolean;
  /** True when the whole KOT is ready → captain notification fires. */
  isFinalReady: boolean;
  serviceMode: ServiceMode | null;
  tableLabel: string | null;
  tokenNo: string | null;
  captainName: string | null;
  guestCount: number | null;
  isRush: boolean;
  kotNote: string | null;
  allergyNote: string | null;
};

/** The four-column board the server returns for one kitchen. */
export type Board = Record<BoardColumn, Tile[]>;
