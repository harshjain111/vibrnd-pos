import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { Clock, ChefHat, CheckCheck } from "lucide-react";
import { Empty } from "@/components/ui/empty";
import { AutoRefresh } from "./auto-refresh";
import { AdvanceButton, CancelButton } from "./ticket-actions";

export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "NEW", label: "New", color: "bg-amber-100 border-amber-300", icon: Clock },
  { key: "IN_PROGRESS", label: "In progress", color: "bg-sky-100 border-sky-300", icon: ChefHat },
  { key: "READY", label: "Ready", color: "bg-emerald-100 border-emerald-300", icon: CheckCheck },
] as const;

const STATIONS = ["ALL", "MAIN", "TANDOOR", "BAR", "DESSERT"] as const;

function minutesAgo(d: Date) {
  return Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
}

export default async function KdsPage({ searchParams }: { searchParams: Promise<{ station?: string }> }) {
  const sp = await searchParams;
  const station = (sp.station ?? "ALL").toUpperCase();
  const outlet = await getActiveOutlet();
  const tickets = await db.kitchenTicket.findMany({
    where: {
      outletId: outlet.id,
      status: { in: ["NEW", "IN_PROGRESS", "READY"] },
      ...(station !== "ALL" ? { station } : {}),
    },
    include: { lines: true, order: { include: { table: true, customer: true } } },
    orderBy: { createdAt: "asc" },
  });

  // Counts per station for the tab labels
  const allActive = await db.kitchenTicket.findMany({
    where: { outletId: outlet.id, status: { in: ["NEW", "IN_PROGRESS", "READY"] } },
    select: { station: true },
  });
  const counts: Record<string, number> = { ALL: allActive.length, MAIN: 0, TANDOOR: 0, BAR: 0, DESSERT: 0 };
  for (const t of allActive) counts[t.station] = (counts[t.station] ?? 0) + 1;

  return (
    <div>
      <PageHeader
        title="Kitchen Display"
        description={`${tickets.length} active tickets · ${station === "ALL" ? "all stations" : station.toLowerCase() + " station"}`}
        actions={<AutoRefresh seconds={20} activeCount={tickets.length} />}
      />

      <div className="flex flex-wrap gap-1.5 mb-4">
        {STATIONS.map((s) => (
          <Link
            key={s}
            href={s === "ALL" ? "/kds" : `/kds?station=${s}`}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
              station === s ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"
            }`}
          >
            <span>{s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}</span>
            <Badge variant="outline" className="text-[10px] bg-background/50">
              {counts[s] ?? 0}
            </Badge>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => {
          const inCol = tickets.filter((t) => t.status === col.key);
          const Icon = col.icon;
          return (
            <div key={col.key} className="space-y-3">
              <div className={`px-3 py-2 rounded-md border-2 ${col.color} flex items-center justify-between font-semibold text-sm`}>
                <span className="inline-flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {col.label}
                </span>
                <Badge variant="outline">{inCol.length}</Badge>
              </div>

              {inCol.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center text-xs text-muted-foreground">
                    Nothing here
                  </CardContent>
                </Card>
              ) : (
                inCol.map((t) => {
                  const age = minutesAgo(t.createdAt);
                  const stale = age >= 15 && t.status !== "READY";
                  return (
                    <Card key={t.id} className={stale ? "border-rose-300" : ""}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <Link
                            href={`/orders/kot/${t.id}/print`}
                            className="font-mono text-xs hover:underline"
                            title="Print KOT"
                          >
                            {t.kotNo}
                          </Link>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[10px]">
                              {t.station}
                            </Badge>
                            <Badge variant={stale ? "destructive" : "secondary"}>{age}m</Badge>
                          </div>
                        </div>

                        <div className="text-xs text-muted-foreground mb-2">
                          {t.order.orderType.replace("_", " ")} ·{" "}
                          {t.order.table?.name ?? t.order.customer?.name ?? "Walk-in"}
                        </div>

                        <ul className="text-sm space-y-0.5 mb-3">
                          {t.lines.map((l) => (
                            <li key={l.id} className="flex justify-between">
                              <span>{l.name}</span>
                              <span className="text-muted-foreground">×{l.qty}</span>
                            </li>
                          ))}
                        </ul>

                        <div className="flex gap-1">
                          <div className="flex-1">
                            <AdvanceButton id={t.id} status={col.key as any} />
                          </div>
                          <CancelButton id={t.id} kotNo={t.kotNo} />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          );
        })}
      </div>

      {tickets.length === 0 && (
        <Card className="mt-4">
          <CardContent>
            <Empty
              title="Kitchen is clear"
              desc="New tickets show up here automatically when an order is placed at the POS."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
