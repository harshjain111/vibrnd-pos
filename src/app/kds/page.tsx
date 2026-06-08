import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { Clock, ChefHat, CheckCheck, AlertTriangle, Printer } from "lucide-react";
import { Empty } from "@/components/ui/empty";
import { AutoRefresh } from "./auto-refresh";
import { AdvanceButton, CancelButton } from "./ticket-actions";
import { KdsToggle } from "./kds-toggle";

export const dynamic = "force-dynamic";

/**
 * Kitchen Display — bird's-eye layout (post-audit overhaul).
 *
 * Old design stacked tickets vertically inside one page-level scroll, so a
 * READY column with 20 tickets pushed the rest off the visible viewport.
 *
 * New design:
 *  • Three sticky-header columns, each independently scrollable inside its own
 *    height-locked container — no page scroll, all three lanes stay in view at
 *    once.
 *  • Tile density: compact cards that render at ~140 px height, two-up on wide
 *    screens, so a single 1080-px monitor shows ~8 tickets per lane without
 *    scrolling.
 *  • Visual urgency: stale tickets (≥ 10 min) get an amber border, ≥ 15 min
 *    pulses red.
 *  • KPI strip at the top shows total active + oldest age — the "bird's eye"
 *    summary the kitchen needs even when scrolling a packed lane.
 */

const COLUMNS = [
  { key: "NEW", label: "New", color: "bg-amber-50 text-amber-900 border-amber-300", icon: Clock },
  { key: "IN_PROGRESS", label: "In progress", color: "bg-sky-50 text-sky-900 border-sky-300", icon: ChefHat },
  { key: "READY", label: "Ready", color: "bg-emerald-50 text-emerald-900 border-emerald-300", icon: CheckCheck },
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

  const allActive = await db.kitchenTicket.findMany({
    where: { outletId: outlet.id, status: { in: ["NEW", "IN_PROGRESS", "READY"] } },
    select: { station: true, createdAt: true, status: true },
  });
  const counts: Record<string, number> = { ALL: allActive.length, MAIN: 0, TANDOOR: 0, BAR: 0, DESSERT: 0 };
  for (const t of allActive) counts[t.station] = (counts[t.station] ?? 0) + 1;

  // KPIs for the bird's-eye strip.
  const oldestAge =
    allActive.length > 0
      ? Math.max(...allActive.map((t) => minutesAgo(t.createdAt)))
      : 0;
  const newCount = allActive.filter((t) => t.status === "NEW").length;
  const inProgressCount = allActive.filter((t) => t.status === "IN_PROGRESS").length;
  const readyCount = allActive.filter((t) => t.status === "READY").length;
  const overdueCount = allActive.filter((t) => minutesAgo(t.createdAt) >= 15 && t.status !== "READY").length;

  const kdsEnabled = (outlet as any).kdsEnabled ?? true;

  return (
    <div className="-mb-4 md:-mb-6">
      <PageHeader
        title="Kitchen Display"
        description={
          kdsEnabled
            ? `${tickets.length} active · ${station === "ALL" ? "all stations" : station.toLowerCase() + " station"}`
            : "KDS is OFF — new KOTs are printing at the station, not routing here"
        }
        actions={
          <>
            <KdsToggle enabled={kdsEnabled} />
            <AutoRefresh seconds={20} activeCount={tickets.length} />
          </>
        }
      />

      {/* When KDS is off, show a prominent banner so it's impossible to miss
          why the screen looks quiet. In-flight tickets still render below so
          the kitchen can finish anything already in progress. */}
      {!kdsEnabled && (
        <div className="mb-3 rounded-lg border-2 border-rose-300 bg-rose-50 p-4 flex items-start gap-3">
          <Printer className="h-5 w-5 text-rose-700 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-rose-900">
              Print-only mode — new KOTs are not routing to this screen
            </div>
            <div className="text-sm text-rose-800 mt-0.5">
              The POS is printing KOTs at the station instead. Existing tickets below stay until
              you serve or cancel them. Click <strong>KDS OFF</strong> above to switch back when the
              kitchen tablet is ready.
            </div>
          </div>
        </div>
      )}

      {/* Bird's-eye KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <KpiCard label="New" value={newCount} tone="amber" Icon={Clock} />
        <KpiCard label="In progress" value={inProgressCount} tone="sky" Icon={ChefHat} />
        <KpiCard label="Ready" value={readyCount} tone="emerald" Icon={CheckCheck} />
        <KpiCard
          label={overdueCount > 0 ? "Overdue ≥15m" : `Oldest ${oldestAge}m`}
          value={overdueCount > 0 ? overdueCount : oldestAge}
          tone={overdueCount > 0 ? "rose" : "neutral"}
          Icon={AlertTriangle}
        />
      </div>

      {/* Station chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
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

      {tickets.length === 0 ? (
        <Card className="mt-4">
          <CardContent>
            <Empty
              title="Kitchen is clear"
              desc="New tickets show up here automatically when an order is placed at the POS."
            />
          </CardContent>
        </Card>
      ) : (
        // Three lanes side-by-side, each with its own scroll. Height locked to
        // viewport-minus-header so the page never scrolls — kitchen sees all three
        // lanes at once.
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 h-[calc(100vh-260px)] min-h-[450px]">
          {COLUMNS.map((col) => {
            const inCol = tickets.filter((t) => t.status === col.key);
            const Icon = col.icon;
            return (
              <section
                key={col.key}
                className={`rounded-lg border-2 ${col.color} flex flex-col overflow-hidden`}
              >
                {/* Sticky lane header — always visible while the lane scrolls. */}
                <header className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 border-b border-current/30 backdrop-blur bg-inherit">
                  <span className="inline-flex items-center gap-2 font-semibold text-sm">
                    <Icon className="h-4 w-4" />
                    {col.label}
                  </span>
                  <Badge variant="outline" className="bg-background/70 text-foreground">
                    {inCol.length}
                  </Badge>
                </header>

                {/* Scrollable tiles area — 2-up on wide screens for higher density. */}
                <div className="flex-1 overflow-y-auto p-2 grid grid-cols-1 xl:grid-cols-2 gap-2 content-start">
                  {inCol.length === 0 ? (
                    <div className="col-span-full text-center text-xs text-muted-foreground py-10 italic">
                      Nothing here
                    </div>
                  ) : (
                    inCol.map((t) => {
                      const age = minutesAgo(t.createdAt);
                      const stale = age >= 10 && t.status !== "READY";
                      const overdue = age >= 15 && t.status !== "READY";
                      const customer = t.order.table?.name ?? t.order.customer?.name ?? "Walk-in";
                      const totalQty = t.lines.reduce((s, l) => s + l.qty, 0);
                      return (
                        <article
                          key={t.id}
                          className={`rounded-md border bg-background p-2 text-xs shadow-sm transition-all ${
                            overdue
                              ? "border-rose-400 ring-2 ring-rose-200 animate-pulse"
                              : stale
                                ? "border-amber-400 ring-1 ring-amber-200"
                                : "border-border"
                          }`}
                        >
                          {/* Tile header — kot # + age */}
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <Link
                              href={`/orders/kot/${t.id}/print`}
                              className="font-mono text-[11px] hover:underline truncate"
                              title="Print KOT"
                            >
                              {t.kotNo}
                            </Link>
                            <Badge
                              variant={overdue ? "destructive" : stale ? "warning" : "secondary"}
                              className="text-[10px] shrink-0"
                            >
                              {age}m
                            </Badge>
                          </div>

                          {/* Customer + station + total qty */}
                          <div className="text-[10px] text-muted-foreground mb-1.5 truncate">
                            {t.order.orderType.replace("_", " ")} · {customer}
                            {station === "ALL" && <> · <span className="font-semibold">{t.station}</span></>}
                            {" · "}
                            <span className="font-semibold">{totalQty} item{totalQty === 1 ? "" : "s"}</span>
                          </div>

                          {/* Items — capped at 6 then "and N more" */}
                          <ul className="text-[11px] space-y-0.5 mb-2 max-h-32 overflow-y-auto">
                            {t.lines.slice(0, 6).map((l) => (
                              <li key={l.id} className="flex justify-between gap-1">
                                <span className="truncate">{l.name}</span>
                                <span className="text-muted-foreground shrink-0">×{l.qty}</span>
                              </li>
                            ))}
                            {t.lines.length > 6 && (
                              <li className="text-muted-foreground italic">+{t.lines.length - 6} more</li>
                            )}
                          </ul>

                          <div className="flex gap-1">
                            <div className="flex-1">
                              <AdvanceButton id={t.id} status={col.key as any} />
                            </div>
                            <CancelButton id={t.id} kotNo={t.kotNo} />
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
  Icon,
}: {
  label: string;
  value: number;
  tone: "amber" | "sky" | "emerald" | "rose" | "neutral";
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const palette = {
    amber: "bg-amber-50 border-amber-300 text-amber-900",
    sky: "bg-sky-50 border-sky-300 text-sky-900",
    emerald: "bg-emerald-50 border-emerald-300 text-emerald-900",
    rose: "bg-rose-50 border-rose-300 text-rose-900",
    neutral: "bg-card border-border text-foreground",
  } as const;
  return (
    <div className={`rounded-md border-2 px-3 py-2 ${palette[tone]} flex items-center gap-2`}>
      <Icon className="h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider opacity-70 truncate">{label}</div>
        <div className="text-lg font-semibold leading-none">{value}</div>
      </div>
    </div>
  );
}
