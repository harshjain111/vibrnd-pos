import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { inr } from "@/lib/utils";
import { getSessionUser } from "@/lib/session";
import { canAccess, loadOutletPermissions } from "@/lib/permissions";
import { Users, Settings } from "lucide-react";
import { AssignTableDialog } from "./assign-table-dialog";

/**
 * Floor plan grid — coordinate-based, status-coloured, role-aware.
 *
 * Status colours:
 *   FREE (green) · OCCUPIED (amber) · READY (sky) · BILL (rose).
 *
 * Behaviour per role:
 *   • RECEPTIONIST / BILLER / MANAGER / OWNER can click a FREE table and
 *     get the "Register customer + assign table" dialog (the matrix's
 *     `pos.action.assign_table` permission).
 *   • CAPTAIN clicking a FREE table goes straight to /billing?table=… as
 *     before — captains don't own the register step.
 *   • An OCCUPIED table always opens its order detail, regardless of role.
 *
 * Captain-queue UX is the same view: status pills on each occupied table
 * surface whether the table has items yet, whether a KOT's gone out, and
 * whether the bill's already been printed — so captains know where to
 * jump next without opening every card.
 */
export async function FloorPlan({ outletId }: { outletId: string }) {
  const [tables, user, overrides] = await Promise.all([
    db.diningTable.findMany({
      where: { outletId, active: true },
      include: {
        orders: {
          where: { status: { in: ["RUNNING", "SAVED", "PRINTED"] } },
          include: {
            items: { select: { id: true } },
            kots: { select: { id: true, status: true } },
            customer: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ area: "asc" }, { name: "asc" }],
    }),
    getSessionUser(),
    loadOutletPermissions(outletId),
  ]);

  const canAssignTable = !!user && canAccess(user.role, "pos.action.assign_table", overrides);

  const active = tables.filter((t) => t.orders.length > 0);
  const estRevenue = active.reduce((s, t) => s + (t.orders[0]?.grandTotal ?? 0), 0);

  // Group by area for the multi-area view.
  const areas = new Map<string, typeof tables>();
  for (const t of tables) {
    const arr = areas.get(t.area) ?? [];
    arr.push(t);
    areas.set(t.area, arr);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total tables" value={String(tables.length)} />
        <Stat label="Active tables" value={String(active.length)} />
        <Stat label="Free" value={String(tables.length - active.length)} />
        <Stat label="Est. revenue" value={inr(estRevenue)} />
      </div>

      <div className="space-y-3">
        {[...areas.entries()].map(([area, ts]) => (
          <Card key={area}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold">{area}</div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/settings/floor-plan">
                    <Settings className="h-3.5 w-3.5" />
                    Edit layout
                  </Link>
                </Button>
              </div>
              <div className="relative w-full aspect-[16/9] rounded-md border bg-[linear-gradient(135deg,_#f8fafc_25%,_transparent_25%,_transparent_50%,_#f8fafc_50%,_#f8fafc_75%,_transparent_75%,_transparent)] bg-[length:20px_20px]">
                {ts.map((t) => {
                  const order = t.orders[0];
                  const itemCount = order?.items.length ?? 0;
                  const hasKot = !!order?.kots.some((k) => ["NEW", "PRINTED", "READY", "READY_FOR_PICKUP"].includes(k.status));
                  const status: "FREE" | "OCCUPIED" | "READY" | "BILL" = order
                    ? order.kots.some((k) => k.status === "READY")
                      ? "READY"
                      : order.status === "PRINTED"
                        ? "BILL"
                        : "OCCUPIED"
                    : "FREE";
                  const tone = {
                    FREE:     "bg-emerald-50 border-emerald-300 text-emerald-900 hover:border-emerald-500",
                    OCCUPIED: "bg-amber-50  border-amber-400   text-amber-900   hover:border-amber-600",
                    READY:    "bg-sky-50    border-sky-400     text-sky-900     hover:border-sky-600",
                    BILL:     "bg-rose-50   border-rose-400    text-rose-900    hover:border-rose-600",
                  }[status];
                  const shape =
                    t.shape === "SQUARE"
                      ? "h-20 w-20 rounded-md"
                      : t.shape === "RECT"
                        ? "h-16 w-28 rounded-md"
                        : "h-20 w-20 rounded-full";

                  // Status pill copy — captains scan these to know what's next.
                  const pill = order
                    ? itemCount === 0
                      ? "no items"
                      : status === "BILL"
                        ? "billed"
                        : hasKot
                          ? status === "READY"
                            ? "ready"
                            : "KOT sent"
                          : "items punched"
                    : null;

                  const inner = (
                    <div
                      className={`flex flex-col items-center justify-center border-2 shadow-sm transition-all ${shape} ${tone}`}
                      title={`${t.name} · ${t.capacity} seats · ${status.toLowerCase()}${
                        order?.customer?.name ? ` · ${order.customer.name}` : ""
                      }`}
                    >
                      <span className="text-sm font-bold leading-none">{t.name}</span>
                      <span className="text-[9px] flex items-center gap-0.5 mt-0.5 opacity-80">
                        <Users className="h-2.5 w-2.5" />
                        {t.capacity}
                      </span>
                      {pill && (
                        <span className="text-[9px] font-semibold mt-0.5 px-1.5 py-0.5 rounded-full bg-white/70 border border-current/30 leading-none">
                          {pill}
                        </span>
                      )}
                      {order?.customer?.name && (
                        <span className="text-[8px] mt-0.5 opacity-80 max-w-[68px] truncate">
                          {order.customer.name}
                        </span>
                      )}
                      {order && order.grandTotal > 0 && (
                        <span className="text-[10px] font-semibold mt-0.5">{inr(order.grandTotal)}</span>
                      )}
                    </div>
                  );

                  // Receptionist-style click for free tables when the user
                  // has permission. Captains without it still go to /billing
                  // directly so the punch flow stays one-click.
                  if (status === "FREE" && canAssignTable) {
                    return (
                      <AssignTableDialog
                        key={t.id}
                        tableId={t.id}
                        tableName={t.name}
                      >
                        <button
                          type="button"
                          style={{
                            position: "absolute",
                            left: `${t.posX}%`,
                            top: `${t.posY}%`,
                            transform: "translate(-50%, -50%)",
                          }}
                          className="cursor-pointer"
                        >
                          {inner}
                        </button>
                      </AssignTableDialog>
                    );
                  }

                  return (
                    <Link
                      key={t.id}
                      href={order ? `/billing?order=${order.id}` : `/billing?table=${t.id}`}
                      style={{
                        position: "absolute",
                        left: `${t.posX}%`,
                        top: `${t.posY}%`,
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      {inner}
                    </Link>
                  );
                })}
                {ts.length === 0 && (
                  <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
                    No tables in this area yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {tables.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No tables yet.
              <Button variant="link" asChild>
                <Link href="/settings/floor-plan">Open the floor-plan editor</Link>
              </Button>
              to drop your first table.
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <Legend color="bg-emerald-200" label="Free" />
        <Legend color="bg-amber-300" label="Occupied" />
        <Legend color="bg-sky-300" label="Food ready" />
        <Legend color="bg-rose-300" label="Bill printed" />
        {canAssignTable && (
          <span className="text-emerald-700">· click a free table to register a customer</span>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded ${color}`} />
      {label}
    </span>
  );
}
