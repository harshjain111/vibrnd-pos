import "server-only";
import { cookies } from "next/headers";
import { db } from "./db";

export const OUTLET_COOKIE = "pos_outlet";

/** Read active outlet from cookie. Falls back to first active outlet. */
export async function getActiveOutlet() {
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
