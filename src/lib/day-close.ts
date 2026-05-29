/**
 * Bill immutability after day-close (audit TASK 15).
 *
 * Once an outlet has filed a DayClose for a business day, every Order whose
 * business day falls on or before the close is frozen. Cancel / reopen / amend
 * / void all throw a clear error unless the actor is the OWNER (override).
 */
import { db } from "./db";
import type { Role } from "./rbac";

type LockableOrder = { id: string; outletId: string; createdAt: Date; invoiceNo: string };

export async function isOrderLocked(order: LockableOrder): Promise<boolean> {
  // Business day = midnight of the order's calendar day in IST.
  const day = new Date(order.createdAt);
  day.setHours(0, 0, 0, 0);
  const close = await db.dayClose.findFirst({
    where: { outletId: order.outletId, businessDay: day },
    select: { id: true },
  });
  return !!close;
}

/**
 * Throws a friendly error if the order is locked (i.e. its day was closed)
 * AND the actor isn't an Owner. Owners can override.
 */
export async function assertOrderEditable(order: LockableOrder, role: Role | string): Promise<void> {
  if (role === "OWNER") return;
  if (await isOrderLocked(order)) {
    throw new Error(
      `${order.invoiceNo} is locked — the business day was closed. Only an Owner can override.`
    );
  }
}
