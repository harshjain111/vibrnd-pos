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
  outletId: string;
};

export async function logActivity(input: LogInput) {
  try {
    let actor = input.actor;
    if (!actor) {
      const user = await getSessionUser().catch(() => null);
      actor = user?.email ?? "system";
    }
    await db.activityLog.create({
      data: {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        summary: input.summary,
        actor,
        outletId: input.outletId,
      },
    });
  } catch (err) {
    console.error("[audit] failed to log:", err);
  }
}
