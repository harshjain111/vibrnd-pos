import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { inr } from "@/lib/utils";
import { Users, Settings } from "lucide-react";

/**
 * Floor plan grid (audit TASK 5) — coordinate-based, status-coloured.
 * Tables render at their (posX, posY) from the floor-plan editor.
 * Status colours:
 *   FREE (green) · OCCUPIED (amber) · READY (sky) · BILL (rose).
 */
export async function FloorPlan({ outletId }: { outletId: string }) {
  const tables = await db.diningTable.findMany({
    where: { outletId, active: true },
    include: {
      orders: {
        where: { status: { in: ["RUNNING", "SAVED", "PRINTED"] } },
        include: { items: true, kots: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ area: "asc" }, { name: "asc" }],
  });

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
                  const status = order
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
                      ? "h-16 w-16 rounded-md"
                      : t.shape === "RECT"
                        ? "h-14 w-24 rounded-md"
                        : "h-16 w-16 rounded-full";
                  return (
                    <Link
                      key={t.id}
                      href={order ? `/orders/${order.id}` : `/billing?table=${t.id}`}
                      style={{
                        position: "absolute",
                        left: `${t.posX}%`,
                        top: `${t.posY}%`,
                        transform: "translate(-50%, -50%)",
                      }}
                      className={`flex flex-col items-center justify-center border-2 shadow-sm transition-all ${shape} ${tone}`}
                      title={`${t.name} · ${t.capacity} seats · ${status.toLowerCase()}`}
                    >
                      <span className="text-sm font-bold leading-none">{t.name}</span>
                      <span className="text-[9px] flex items-center gap-0.5 mt-0.5 opacity-80">
                        <Users className="h-2.5 w-2.5" />
                        {t.capacity}
                      </span>
                      {order && <span className="text-[10px] font-semibold mt-0.5">{inr(order.grandTotal)}</span>}
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
