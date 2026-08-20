// KDS v2 — status state machine. Zero I/O.
// Spec §20.
//
// The guard runs both client-side (before optimistic patch) and
// server-side (before the DB write). Illegal transitions are the "QA
// list" errors at the bottom of §20:
//   NEW → SERVED           (must be cooked first)
//   HELD → READY           (fire it first)
//   CANCELLED → *          (terminal)
//   READY → NEW            (use RECALL, which lands on PREPARING)
//   SERVED written by CHEF (chef can never mark served)
//   READY  written by CAPTAIN
//   any change on a SETTLED order (unless via RECALL)

import type { ActorRole, KotItemStatus } from "./types";

export type TransitionArgs = {
  from: KotItemStatus;
  to: KotItemStatus;
  actorRole: ActorRole;
  /** Force through a normally-illegal downgrade — set only by RECALL. */
  force?: boolean;
  /** Present when the parent order has been settled. */
  orderSettled?: boolean;
};

export type TransitionResult =
  | { ok: true }
  | { ok: false; code: TransitionError; message: string };

export type TransitionError =
  | "ILLEGAL_TRANSITION"
  | "ROLE_NOT_PERMITTED"
  | "ITEM_CANCELLED"
  | "ORDER_SETTLED";

// Adjacency map per §20. NEW/HELD are the two entry states; SERVED and
// CANCELLED are terminal (returns via RECALL are treated as a distinct
// force-flagged transition, not a natural edge).
const FORWARD: Partial<Record<KotItemStatus, KotItemStatus[]>> = {
  NEW: ["PREPARING", "HELD"],
  HELD: ["NEW"], // fire → back to NEW (then the chef taps to PREPARING)
  PREPARING: ["READY"],
  READY: ["SERVED"],
};

// Who is allowed to write each destination status.
const WRITER_ROLES: Record<KotItemStatus, ActorRole[]> = {
  NEW: ["CHEF", "SYSTEM", "CAPTAIN"], // recall from PREPARING lands here
  HELD: ["CHEF", "CAPTAIN", "SYSTEM"],
  PREPARING: ["CHEF", "SYSTEM"],
  READY: ["CHEF", "SYSTEM"], // never a captain
  SERVED: ["CAPTAIN", "SYSTEM"], // never a chef
  CANCELLED: ["CAPTAIN", "CASHIER", "MANAGER"], // never a chef
};

export function canTransition(args: TransitionArgs): TransitionResult {
  const { from, to, actorRole, force = false, orderSettled = false } = args;

  if (from === "CANCELLED") {
    return {
      ok: false,
      code: "ITEM_CANCELLED",
      message: "Cancelled item cannot change status",
    };
  }

  if (orderSettled && !force) {
    return {
      ok: false,
      code: "ORDER_SETTLED",
      message: "Order is settled — only RECALL can reopen it",
    };
  }

  if (!(WRITER_ROLES[to] ?? []).includes(actorRole)) {
    return {
      ok: false,
      code: "ROLE_NOT_PERMITTED",
      message: `Role ${actorRole} cannot write ${to}`,
    };
  }

  // Cancellations are legal from any live state.
  if (to === "CANCELLED") return { ok: true };

  const allowed = FORWARD[from] ?? [];
  if (allowed.includes(to)) return { ok: true };

  // Any other edge only lands with the RECALL force flag.
  if (force) return { ok: true };

  return {
    ok: false,
    code: "ILLEGAL_TRANSITION",
    message: `${from} → ${to} is not permitted`,
  };
}

/** The "next" tap-forward status. Returns null when there's nothing to
 *  do (item is terminal, or held — held items need FIRE first). §8. */
export function nextTapStatus(from: KotItemStatus): KotItemStatus | null {
  switch (from) {
    case "NEW":       return "PREPARING";
    case "PREPARING": return "READY";
    case "READY":     return "SERVED";
    default:          return null;
  }
}
