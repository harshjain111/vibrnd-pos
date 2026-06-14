import { db } from "./db";
import { getSessionUser } from "./session";

type LogInput = {
  action: "CREATE" | "UPDATE" | "DELETE" | "CANCEL" | "SETTLE" | "ACCEPT" | "REJECT" | "ADVANCE";
  entity:
    | "Order"
    | "KOT"
    | "Item"
    | "Discount"
    | "Customer"
    | "RawMaterial"
    | "Outlet"
    | "Expense"
    | "Table"
    | "Purchase"
    | "Transfer"
    | "StockCount"
    | "ProductionRun"
    | "InventorySetting"
    | "ReportNotification";
  entityId?: string;
  summary: string;
  actor?: string;
  /** Role at action-time. When omitted, pulled from the session user. */
  role?: string;
  /** Captured reason for VOID / DISCOUNT / COMP / REPRINT / CANCEL actions. */
  reason?: string;
  /** Prior state snapshot — accepts any JSON-serialisable value. Capped
   *  at ~2KB to keep the audit table from inflating. Strings are passed
   *  through as-is so callers don't have to JSON.stringify a single field. */
  oldValue?: unknown;
  newValue?: unknown;
  outletId: string;
};

const VALUE_CAP = 2000;

function serialise(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") return v.slice(0, VALUE_CAP);
  try {
    const s = JSON.stringify(v);
    return s.length > VALUE_CAP ? s.slice(0, VALUE_CAP - 3) + "..." : s;
  } catch {
    return String(v).slice(0, VALUE_CAP);
  }
}

export async function logActivity(input: LogInput) {
  try {
    let actor = input.actor;
    let role = input.role;
    if (!actor || !role) {
      const user = await getSessionUser().catch(() => null);
      if (!actor) actor = user?.email ?? "system";
      if (!role) role = user?.role ?? undefined;
    }
    await db.activityLog.create({
      data: {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        summary: input.summary,
        actor,
        role: role ?? null,
        reason: input.reason ?? null,
        oldValue: serialise(input.oldValue) ?? null,
        newValue: serialise(input.newValue) ?? null,
        outletId: input.outletId,
      },
    });
  } catch (err) {
    console.error("[audit] failed to log:", err);
  }
}
