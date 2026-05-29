import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { rangeBounds, type RangeKey } from "@/lib/analytics";
import { inr } from "@/lib/utils";
import { RangePicker } from "@/app/_components/range-picker";
import { ReconcileDialog } from "./client";

export const dynamic = "force-dynamic";

const PLATFORMS = ["SWIGGY", "ZOMATO", "MAGICPIN", "DOTPE"] as const;

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: RangeKey; platform?: string }>;
}) {
  await requireUser("MANAGER");
  const sp = await searchParams;
  const range = (sp.range ?? "last7") as RangeKey;
  const { from, to, label } = rangeBounds(range);
  const outlet = await getActiveOutlet();

  const where: any = {
    outletId: outlet.id,
    channel: { in: PLATFORMS },
    createdAt: { gte: from, lte: to },
    status: { in: ["DELIVERED", "PICKED_UP", "FOOD_READY", "ACCEPTED"] },
  };
  if (sp.platform && sp.platform !== "all") where.channel = sp.platform;

  const orders = await db.order.findMany({
    where,
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const reconciled = orders.filter((o) => o.reconciledAt);
  const unreconciled = orders.filter((o) => !o.reconciledAt);
  const posTotal = orders.reduce((s, o) => s + o.grandTotal, 0);
  const aggTotal = reconciled.reduce((s, o) => s + (o.reconciledAmount ?? 0), 0);
  const variance = reconciled.reduce((s, o) => s + ((o.reconciledAmount ?? 0) - o.grandTotal), 0);

  // Per-platform roll-up
  const byPlatform = new Map<string, { count: number; pos: number; agg: number; reconciled: number }>();
  for (const o of orders) {
    const cur = byPlatform.get(o.channel) ?? { count: 0, pos: 0, agg: 0, reconciled: 0 };
    cur.count += 1;
    cur.pos += o.grandTotal;
    if (o.reconciledAt) {
      cur.agg += o.reconciledAmount ?? 0;
      cur.reconciled += 1;
    }
    byPlatform.set(o.channel, cur);
  }

  return (
    <div>
      <PageHeader
        title="Online order reconciliation"
        description={`${label} · ${orders.length} aggregator orders · ${reconciled.length} reconciled · ${unreconciled.length} pending`}
        actions={<RangePicker current={range} />}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <Kpi label="POS recorded" value={inr(posTotal)} />
        <Kpi label="Aggregator settled" value={inr(aggTotal)} />
        <Kpi label="Variance" value={inr(variance)} tone={variance >= 0 ? "good" : "bad"} />
        <Kpi label="Pending reconcile" value={String(unreconciled.length)} tone={unreconciled.length > 0 ? "warn" : "neutral"} />
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Per-platform rollup</CardTitle>
          <CardDescription>Difference between what the POS recorded and what each aggregator paid out</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Platform</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Reconciled</TableHead>
                <TableHead className="text-right">POS</TableHead>
                <TableHead className="text-right">Aggregator</TableHead>
                <TableHead className="text-right">Variance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...byPlatform.entries()].map(([p, v]) => {
                const variance = v.agg - v.pos;
                return (
                  <TableRow key={p}>
                    <TableCell>
                      <Badge variant="outline">{p}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{v.count}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {v.reconciled} / {v.count}
                    </TableCell>
                    <TableCell className="text-right">{inr(v.pos)}</TableCell>
                    <TableCell className="text-right">{v.reconciled > 0 ? inr(v.agg) : "—"}</TableCell>
                    <TableCell className={`text-right font-medium ${variance < 0 ? "text-rose-700" : variance > 0 ? "text-emerald-700" : ""}`}>
                      {v.reconciled > 0 ? inr(variance) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {byPlatform.size === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                    No aggregator orders in this range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-order detail</CardTitle>
          <CardDescription>Click an invoice to drill in; enter the aggregator payout to reconcile.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Aggregator ID</TableHead>
                <TableHead className="text-right">POS amount</TableHead>
                <TableHead className="text-right">Aggregator paid</TableHead>
                <TableHead className="text-right">Δ</TableHead>
                <TableHead className="text-right w-40">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-12">
                    No aggregator orders in this range.
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((o) => {
                  const diff =
                    o.reconciledAt && o.reconciledAmount != null ? o.reconciledAmount - o.grandTotal : null;
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">
                        <Link href={`/orders/${o.id}`} className="hover:underline">
                          {o.invoiceNo}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(o.createdAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{o.channel}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {o.aggregatorOrderId ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">{inr(o.grandTotal)}</TableCell>
                      <TableCell className="text-right">
                        {o.reconciledAt ? inr(o.reconciledAmount ?? 0) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          diff == null ? "" : diff < 0 ? "text-rose-700" : diff > 0 ? "text-emerald-700" : ""
                        }`}
                      >
                        {diff == null ? "—" : inr(diff)}
                      </TableCell>
                      <TableCell className="text-right">
                        <ReconcileDialog
                          orderId={o.id}
                          invoiceNo={o.invoiceNo}
                          posAmount={o.grandTotal}
                          existing={o.reconciledAmount ?? null}
                          reconciledAt={o.reconciledAt}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "warn" | "neutral";
}) {
  const colors: Record<string, string> = {
    good: "text-emerald-700",
    bad: "text-rose-700",
    warn: "text-amber-700",
    neutral: "",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold mt-0.5 ${colors[tone]}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
