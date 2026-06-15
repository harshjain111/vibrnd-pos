import Link from "next/link";
import { Prisma } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { inr } from "@/lib/utils";
import { getSessionUser } from "@/lib/session";
import { canAccess, loadOutletPermissions } from "@/lib/permissions";
import { Users, Settings } from "lucide-react";
import { AssignTableDialog } from "./assign-table-dialog";

// Hoist the include shape to a typed Prisma input so the inferred
// result type carries every included relation through to the JSX.
// Without this, TS sometimes resolves the `tables` const to a bare
// DiningTable (with no orders / tableGroup) — likely a generic
// inference quirk when the awaited findMany sits next to a session
// helper in the same component. The validator avoids any cast.
const tableInclude = Prisma.validator<Prisma.DiningTableDefaultArgs>()({
  include: {
    tableGroup: { include: { captain: { select: { id: true, name: true } } } },
    orders: {
      where: { status: { in: ["RUNNING", "SAVED", "PRINTED"] } },
      include: {
        items: { select: { id: true } },
        kots: { select: { id: true, status: true } },
        customer: { select: { name: true } },
        captain: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" as const },
      take: 1,
    },
  },
});
type TableWithRels = Prisma.DiningTableGetPayload<typeof tableInclude>;

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
  // Cast through TableWithRels — the validator-typed include block
  // ensures every relation we read below is present at runtime.
  const tables = (await db.diningTable.findMany({
    where: { outletId, active: true },
    ...tableInclude,
    orderBy: [{ area: "asc" }, { name: "asc" }],
  })) as TableWithRels[];
  const [user, overrides] = await Promise.all([
    getSessionUser(),
    loadOutletPermissions(outletId),
  ]);

  const canAssignTable = !!user && canAccess(user.role, "pos.action.assign_table", overrides);
  const isCaptain = user?.role === "CAPTAIN";

  const active = tables.filter((t) => t.orders.length > 0);
  const estRevenue = active.reduce((s, t) => s + (t.orders[0]?.grandTotal ?? 0), 0);

  // Captain-specific "what's waiting for me right now" list. Only the
  // tables whose running order is attributed to the logged-in captain.
  // Sorted by created time so the oldest unattended bill sits at the top.
  const myTables = isCaptain
    ? active
        .filter((t) => t.orders[0]?.captainId === user!.id)
        .sort((a, b) => (a.orders[0]?.createdAt?.getTime() ?? 0) - (b.orders[0]?.createdAt?.getTime() ?? 0))
    : [];

  // Group by area for the multi-area view.
  const areas = new Map<string, typeof tables>();
  for (const t of tables) {
    const arr = areas.get(t.area) ?? [];
    arr.push(t);
    areas.set(t.area, arr);
  }

  return (
    <div className="space-y-4">
      {/* Pinned "My tables waiting" banner — only renders for a
          logged-in CAPTAIN and only when they actually have tables.
          This is how the receptionist's hand-off becomes visible. */}
      {isCaptain && myTables.length > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-primary">
                  {myTables.length} table{myTables.length === 1 ? "" : "s"} waiting for you
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Receptionist hand-offs · click to open the bill
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {myTables.map((t) => {
                const o = t.orders[0]!;
                const wait = o.createdAt
                  ? Math.max(0, Math.round((Date.now() - o.createdAt.getTime()) / 60000))
                  : 0;
                const itemCount = o.items.length;
                return (
                  <Link
                    key={t.id}
                    href={`/billing?resume=${o.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border bg-background hover:border-primary hover:shadow-sm transition-all"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-sm flex items-center gap-1.5">
                        {t.name}
                        <span className="text-[10px] text-muted-foreground font-normal">· {t.area}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {o.customer?.name ?? o.customerName ?? "Walk-in"}
                        {itemCount > 0 && ` · ${itemCount} item${itemCount === 1 ? "" : "s"}`}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-muted-foreground">
                        {wait < 1 ? "just now" : `${wait}m waiting`}
                      </div>
                      <div className="text-xs font-semibold text-primary">Open →</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total tables" value={String(tables.length)} />
        <Stat label="Active tables" value={String(active.length)} />
        <Stat label={isCaptain ? "My tables" : "Free"} value={String(isCaptain ? myTables.length : tables.length - active.length)} />
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
                  // Mine = the logged-in captain owns this running order
                  // OR the table-group's default captain is them (so a
                  // captain knows "this empty patio is yours when it fills").
                  const isMine =
                    isCaptain &&
                    ((order?.captainId === user!.id) ||
                      (status === "FREE" && t.tableGroup?.captainId === user!.id));
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
                  // Captain's own tables get a thick primary ring so they
                  // pop on a busy floor plan.
                  const mineRing = isMine ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "";

                  // Captain attribution to show under the table name.
                  // When occupied, prefer the order's captain; when free,
                  // fall back to the table-group's default.
                  const captainName =
                    order?.captain?.name ??
                    (status === "FREE" ? t.tableGroup?.captain?.name : null);

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
                      className={`flex flex-col items-center justify-center border-2 shadow-sm transition-all ${shape} ${tone} ${mineRing}`}
                      title={`${t.name} · ${t.capacity} seats · ${status.toLowerCase()}${
                        order?.customer?.name ? ` · ${order.customer.name}` : ""
                      }${captainName ? ` · captain ${captainName}` : ""}`}
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
                      {captainName && (
                        <span
                          className={
                            "text-[8px] mt-0.5 px-1 py-px rounded leading-none max-w-[72px] truncate " +
                            (isMine
                              ? "bg-primary text-primary-foreground font-semibold"
                              : "bg-white/70 border border-current/30")
                          }
                          title={`Captain: ${captainName}`}
                        >
                          {isMine ? "YOU · " : ""}{captainName}
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
