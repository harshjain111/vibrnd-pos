import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { rangeBounds, type RangeKey } from "@/lib/analytics";
import { inr } from "@/lib/utils";
import { Building2, TrendingUp, Wallet, AlertCircle, Store } from "lucide-react";
import { RangePicker } from "@/app/_components/range-picker";

export const dynamic = "force-dynamic";

export default async function HqPage({ searchParams }: { searchParams: Promise<{ range?: RangeKey }> }) {
  await requireUser("OWNER");
  const sp = await searchParams;
  const range = (sp.range ?? "last7") as RangeKey;
  const { from, to, label } = rangeBounds(range);

  const outlets = await db.outlet.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });

  // Per-outlet stats — fetched in parallel
  const perOutlet = await Promise.all(
    outlets.map(async (o) => {
      const [orders, expenses, returns, lowRms, openOnline] = await Promise.all([
        db.order.findMany({
          where: { outletId: o.id, createdAt: { gte: from, lte: to }, status: { in: ["PAID", "PRINTED"] } },
          select: { grandTotal: true, taxTotal: true, paymentMode: true, orderType: true, channel: true },
        }),
        db.expense.findMany({
          where: { outletId: o.id, createdAt: { gte: from, lte: to } },
          select: { amount: true },
        }),
        db.salesReturn.findMany({
          where: { outletId: o.id, createdAt: { gte: from, lte: to } },
          select: { amount: true },
        }),
        db.rawMaterial.count({
          where: { outletId: o.id, currentQty: { lt: 0 } }, // placeholder, refined below
        }),
        db.order.count({
          where: { outletId: o.id, status: "PLACED", channel: { in: ["SWIGGY", "ZOMATO", "MAGICPIN", "DOTPE"] } },
        }),
      ]);
      // Recompute low stock properly
      const rms = await db.rawMaterial.findMany({ where: { outletId: o.id } });
      const lowStock = rms.filter((r) => r.currentQty < r.minLevel).length;
      const sales = orders.reduce((s, x) => s + x.grandTotal, 0);
      const tax = orders.reduce((s, x) => s + x.taxTotal, 0);
      const expensesTotal = expenses.reduce((s, x) => s + x.amount, 0);
      const returnsTotal = returns.reduce((s, x) => s + x.amount, 0);
      const cash = orders.filter((x) => x.paymentMode === "CASH").reduce((s, x) => s + x.grandTotal, 0);
      const online = orders.filter((x) => x.paymentMode === "ONLINE").reduce((s, x) => s + x.grandTotal, 0);
      return {
        outlet: o,
        sales,
        tax,
        orderCount: orders.length,
        expenses: expensesTotal,
        returns: returnsTotal,
        netProfit: sales - expensesTotal - returnsTotal,
        cash,
        online,
        avgOrderValue: orders.length ? sales / orders.length : 0,
        lowStock,
        openOnline,
      };
    })
  );

  // Aggregate roll-up
  const total = perOutlet.reduce(
    (acc, p) => ({
      sales: acc.sales + p.sales,
      tax: acc.tax + p.tax,
      orders: acc.orders + p.orderCount,
      expenses: acc.expenses + p.expenses,
      returns: acc.returns + p.returns,
      netProfit: acc.netProfit + p.netProfit,
      lowStock: acc.lowStock + p.lowStock,
      openOnline: acc.openOnline + p.openOnline,
    }),
    { sales: 0, tax: 0, orders: 0, expenses: 0, returns: 0, netProfit: 0, lowStock: 0, openOnline: 0 }
  );

  // Channel split (POS vs Online) across outlets
  const allOrders = await db.order.findMany({
    where: {
      outletId: { in: outlets.map((o) => o.id) },
      createdAt: { gte: from, lte: to },
      status: { in: ["PAID", "PRINTED"] },
    },
    select: { channel: true, grandTotal: true },
  });
  const channelMap = new Map<string, number>();
  for (const o of allOrders) channelMap.set(o.channel, (channelMap.get(o.channel) ?? 0) + o.grandTotal);

  return (
    <div>
      <PageHeader
        title="Head Office"
        description={`${outlets.length} outlet${outlets.length === 1 ? "" : "s"} · ${label.toLowerCase()}`}
        actions={
          <>
            <RangePicker current={range} />
            <Button variant="outline" size="sm" asChild>
              <Link href="/outlets">Manage outlets</Link>
            </Button>
          </>
        }
      />

      {/* Top KPIs — rolled up */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Kpi label="Total sales" value={inr(total.sales)} sub={`${total.orders} orders`} icon={<TrendingUp className="h-4 w-4" />} />
        <Kpi
          label="Net profit"
          value={inr(total.netProfit)}
          sub={`Expenses ${inr(total.expenses)} · Returns ${inr(total.returns)}`}
          icon={<Wallet className="h-4 w-4" />}
          tone={total.netProfit >= 0 ? "good" : "bad"}
        />
        <Kpi label="GST collected" value={inr(total.tax)} icon={<Building2 className="h-4 w-4" />} />
        <Kpi
          label="Action items"
          value={`${total.lowStock + total.openOnline}`}
          sub={`${total.lowStock} low stock · ${total.openOnline} pending online`}
          icon={<AlertCircle className="h-4 w-4" />}
          tone={total.lowStock + total.openOnline > 0 ? "warn" : "neutral"}
        />
      </div>

      {/* Per-outlet breakdown */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Per-outlet breakdown</CardTitle>
          <CardDescription>Click an outlet to switch the active context and drill in.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Outlet</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">AOV</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Returns</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Alerts</TableHead>
                <TableHead className="text-right">Store</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perOutlet.map((p) => (
                <TableRow key={p.outlet.id}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      <Store className="h-3.5 w-3.5 text-muted-foreground" />
                      {p.outlet.name}
                      <span className="text-xs text-muted-foreground">{p.outlet.code}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{p.orderCount}</TableCell>
                  <TableCell className="text-right font-medium">{inr(p.sales)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{inr(p.avgOrderValue)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{inr(p.expenses)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{p.returns > 0 ? inr(p.returns) : "—"}</TableCell>
                  <TableCell className={`text-right font-medium ${p.netProfit < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                    {inr(p.netProfit)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {p.openOnline > 0 && (
                        <Badge variant="info" className="text-[10px]">
                          {p.openOnline} pending
                        </Badge>
                      )}
                      {p.lowStock > 0 && (
                        <Badge variant="destructive" className="text-[10px]">
                          {p.lowStock} low
                        </Badge>
                      )}
                      {p.openOnline === 0 && p.lowStock === 0 && <span className="text-xs text-muted-foreground">clear</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {p.outlet.storeOpen ? (
                      <Badge variant="success" className="text-[10px]">OPEN</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px]">CLOSED</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{total.orders}</TableCell>
                <TableCell className="text-right">{inr(total.sales)}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {total.orders ? inr(total.sales / total.orders) : "—"}
                </TableCell>
                <TableCell className="text-right">{inr(total.expenses)}</TableCell>
                <TableCell className="text-right">{inr(total.returns)}</TableCell>
                <TableCell className={`text-right ${total.netProfit < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                  {inr(total.netProfit)}
                </TableCell>
                <TableCell></TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Anomaly feed */}
      <AnomalyFeed outletIds={outlets.map((o) => o.id)} from={from} to={to} />

      {/* Channel rollup */}
      <Card>
        <CardHeader>
          <CardTitle>Sales by channel</CardTitle>
          <CardDescription>Across all outlets in the selected range</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">% of total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...channelMap.entries()].sort((a, b) => b[1] - a[1]).map(([ch, v]) => (
                <TableRow key={ch}>
                  <TableCell>{ch}</TableCell>
                  <TableCell className="text-right">{inr(v)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {((v / Math.max(1, total.sales)) * 100).toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
              {channelMap.size === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-8">
                    No sales in range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

async function AnomalyFeed({ outletIds, from, to }: { outletIds: string[]; from: Date; to: Date }) {
  // Find anomalies across outlets:
  // 1. Cancelled orders (any)
  // 2. Large refunds (returns)
  // 3. Big day-close variances (|variance| > 100)
  // 4. Heavy discounts (discount > 30% of grand)
  const [cancelled, returns, closesWithVariance, heavyDiscounts] = await Promise.all([
    db.order.findMany({
      where: { outletId: { in: outletIds }, status: "CANCELLED", createdAt: { gte: from, lte: to } },
      include: { outlet: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.salesReturn.findMany({
      where: { outletId: { in: outletIds }, createdAt: { gte: from, lte: to } },
      include: { outlet: true, order: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.dayClose.findMany({
      where: { outletId: { in: outletIds }, businessDay: { gte: from, lte: to } },
      include: { outlet: true },
      orderBy: { businessDay: "desc" },
    }),
    db.order.findMany({
      where: {
        outletId: { in: outletIds },
        createdAt: { gte: from, lte: to },
        status: { in: ["PAID", "PRINTED"] },
      },
      include: { outlet: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const heavy = heavyDiscounts.filter(
    (o) => o.grandTotal > 0 && o.discount / (o.grandTotal + o.discount) > 0.3
  );

  const anomalies = [
    ...cancelled.map((o) => ({
      id: `cnc-${o.id}`,
      kind: "Cancelled order",
      severity: "destructive" as const,
      detail: `${o.invoiceNo} · ${o.outlet.name} · ${inr(o.grandTotal)}${o.notes ? ` — ${o.notes}` : ""}`,
      href: `/orders/${o.id}`,
      at: o.createdAt,
    })),
    ...returns.map((r) => ({
      id: `ret-${r.id}`,
      kind: "Sales return",
      severity: "warning" as const,
      detail: `${r.returnNo} · ${r.outlet.name} · ${inr(r.amount)} refunded ${r.refundMode}`,
      href: `/orders/${r.order.id}`,
      at: r.createdAt,
    })),
    ...closesWithVariance
      .filter((c) => Math.abs(c.variance) > 100)
      .map((c) => ({
        id: `var-${c.id}`,
        kind: "Cash variance",
        severity: "destructive" as const,
        detail: `${c.outlet.name} on ${new Date(c.businessDay).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} · variance ${inr(c.variance)}`,
        href: `/day-end/${new Date(c.businessDay).toISOString().slice(0, 10)}`,
        at: c.createdAt,
      })),
    ...heavy.slice(0, 8).map((o) => ({
      id: `disc-${o.id}`,
      kind: "Heavy discount",
      severity: "warning" as const,
      detail: `${o.invoiceNo} · ${o.outlet.name} · ${inr(o.discount)} off ${inr(o.grandTotal + o.discount)}${o.discountCode ? ` (${o.discountCode})` : ""}`,
      href: `/orders/${o.id}`,
      at: o.createdAt,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Anomaly feed</CardTitle>
        <CardDescription>
          Voids, cancellations, returns, heavy discounts, cash variances — across all outlets.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {anomalies.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No anomalies in range. 🎉</div>
        ) : (
          <ul className="divide-y">
            {anomalies.slice(0, 20).map((a) => (
              <li key={a.id}>
                <Link href={a.href} className="block px-4 py-2.5 hover:bg-accent">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant={a.severity}>{a.kind}</Badge>
                      <span className="text-sm truncate">{a.detail}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(a.at).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone?: "good" | "bad" | "warn" | "neutral";
}) {
  const tones: Record<string, string> = {
    good: "text-emerald-700",
    bad: "text-rose-700",
    warn: "text-amber-700",
    neutral: "",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
          <span className="h-7 w-7 rounded-md bg-muted flex items-center justify-center text-muted-foreground">{icon}</span>
        </div>
        <div className={`text-2xl font-semibold tracking-tight ${tones[tone]}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}
