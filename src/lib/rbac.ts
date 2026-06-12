import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./session";

/**
 * Two parallel role hierarchies live in this app:
 *
 *  • The classic POS hierarchy — CAPTAIN < BILLER < MANAGER < OWNER. These
 *    map cleanly to seniority and we still use `hasAtLeast(role, "MANAGER")`
 *    for "or above" checks throughout POS / billing / orders code paths.
 *
 *  • The inventory + procurement roles added in the chain-inventory rollout
 *    — STORE_MANAGER, COST_CONTROLLER, CHEF_HOD, BARTENDER_HOD,
 *    HOUSEKEEPING_HOD, ACCOUNTANT, PRODUCTION_MANAGER. These are NOT a
 *    linear hierarchy — a Chef HOD isn't "less than" an Accountant; they
 *    just own different surfaces. So they sit at the same notional rank
 *    (between BILLER and MANAGER), and access is gated per-page in the
 *    permissions registry instead of via a numeric "at least" check.
 *
 * `hasAtLeast` only meaningfully orders the POS hierarchy. For inventory
 * roles, callers should consult `canAccess(role, pageId)` from
 * `./permissions.ts` instead.
 */
export const POS_ROLES = ["OWNER", "MANAGER", "BILLER", "CAPTAIN"] as const;
export const INVENTORY_ROLES = [
  "STORE_MANAGER",
  "COST_CONTROLLER",
  "CHEF_HOD",
  "BARTENDER_HOD",
  "HOUSEKEEPING_HOD",
  "ACCOUNTANT",
  "PRODUCTION_MANAGER",
] as const;
export const ROLES = [...POS_ROLES, ...INVENTORY_ROLES] as const;
export type PosRole = (typeof POS_ROLES)[number];
export type InventoryRole = (typeof INVENTORY_ROLES)[number];
export type Role = (typeof ROLES)[number];

/** Higher rank = more powerful for the POS hierarchy. Inventory roles sit
 *  at rank 2 (between BILLER and MANAGER) — they manage their own slice
 *  of the app but can't override MANAGER-and-above actions. */
const RANK: Record<Role, number> = {
  CAPTAIN: 1,
  BILLER: 2,
  STORE_MANAGER: 2,
  COST_CONTROLLER: 2,
  CHEF_HOD: 2,
  BARTENDER_HOD: 2,
  HOUSEKEEPING_HOD: 2,
  ACCOUNTANT: 2,
  PRODUCTION_MANAGER: 2,
  MANAGER: 3,
  OWNER: 4,
};

export function hasAtLeast(actor: Role | string, required: Role): boolean {
  return (RANK[actor as Role] ?? 0) >= RANK[required];
}

/** True for the seven new inventory/procurement roles. Used by the shell to
 *  pick the slim sidebar + the role-specific landing redirect. */
export function isInventoryRole(role: Role | string): role is InventoryRole {
  return (INVENTORY_ROLES as readonly string[]).includes(role);
}

/** Map an inventory role to the department-kind it owns (if any). HODs are
 *  scoped to their kitchen / bar / housekeeping; STORE_MANAGER owns STORE;
 *  the rest are outlet-wide. */
export function ownedDepartmentKind(role: Role | string): string | null {
  switch (role) {
    case "STORE_MANAGER":
      return "STORE";
    case "CHEF_HOD":
      return "KITCHEN";
    case "BARTENDER_HOD":
      return "BAR";
    case "HOUSEKEEPING_HOD":
      return "HOUSEKEEPING";
    default:
      return null;
  }
}

/**
 * Require an authenticated session, optionally with a minimum role.
 * Redirects to /login if missing, to / if role too low.
 */
export async function requireUser(minRole?: Role): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (minRole && !hasAtLeast(user.role, minRole)) redirect("/");
  return user;
}

/** Non-redirecting variant; returns null if not authorized. */
export async function getAuthorizedUser(minRole?: Role): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (minRole && !hasAtLeast(user.role, minRole)) return null;
  return user;
}
