import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./session";

export const ROLES = ["OWNER", "MANAGER", "BILLER", "CAPTAIN"] as const;
export type Role = (typeof ROLES)[number];

// Higher rank = more powerful
const RANK: Record<Role, number> = {
  CAPTAIN: 1,
  BILLER: 2,
  MANAGER: 3,
  OWNER: 4,
};

export function hasAtLeast(actor: Role | string, required: Role): boolean {
  return (RANK[actor as Role] ?? 0) >= RANK[required];
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
