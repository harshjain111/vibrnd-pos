import "server-only";
import { cookies } from "next/headers";
import { db } from "./db";
import { getSessionUser } from "./session";

export const OUTLET_COOKIE = "pos_outlet";

/**
 * Read active outlet from cookie. Falls back to first active outlet.
 *
 * Defense in depth (audit TASK 17): asserts an authenticated session exists.
 * Every server action that calls this is automatically protected from
 * unauthenticated hits even if it forgot its own `requireUser` check.
 */
export async function getActiveOutlet() {
  const user = await getSessionUser();
  if (!user) throw new Error("Authentication required");
  const c = await cookies();
  const cookieVal = c.get(OUTLET_COOKIE)?.value;

  if (cookieVal) {
    const o = await db.outlet.findFirst({ where: { id: cookieVal, active: true } });
    if (o) return o;
  }
  const first = await db.outlet.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } });
  if (!first) throw new Error("No outlet seeded. Run `npm run db:seed`.");
  return first;
}

/** List of outlets the current user can switch to (OWNER sees all, others see their own only). */
export async function listAccessibleOutlets(userOutletId: string, role: string) {
  if (role === "OWNER") {
    return db.outlet.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
  }
  const o = await db.outlet.findFirst({ where: { id: userOutletId, active: true } });
  return o ? [o] : [];
}
