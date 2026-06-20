/**
 * Procurement cockpit — single-screen overview of the entire procurement
 * chain across every outlet. Built for the Cost Controller's daily ritual
 * and for the Owner's weekly health check.
 *
 * Sections:
 *   1. Pending CC approvals — POs waiting for a decision, with age
 *   2. PO funnel — counts by status, value by status
 *   3. Recent rejections — last N PO rejections with reasons
 *   4. AP aging — outstanding vendor invoices bucketed 0–30 / 31–60 /
 *      61–90 / 90+
 *   5. Top suppliers by spend last 90 days
 */
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { canAccess } from "@/lib/permissions";
import { inr, fmtDate } from "@/lib/utils";
import { Clock, AlertCircle, TrendingUp, Wallet, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProcurementCockpitPage() {
  const user = await requireUser();
  if (!canAccess(user.role, "inventory.reports.procurement-cockpit")) {
    return (
      <div>
        <PageHeader title="Procurement cockpit" description="Forbidden" />
        <Card>
          <CardContent>
            <Empty title="Restricted" desc="Only Cost Controller / Owner / Manager." />
          </CardContent>
        </Card>
      </div>
    );
  }

  const now = Date.now();
  const ninetyDaysAgo = new Date(now - 90 * 86400000);
  const thirtyDaysAgo = new Date(now - 30 * 86400000);

  // ── 1. Pending CC approvals (with age) ──────────────────────────────
  const pendingCC = await db.purchaseOrder.findMany({
    where: { status: "PENDING_CC_APPROVAL" },
    include: { supplier: { select: { name: true } }, outlet: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const oldestPendingDays = pendingCC.length
    ? Math.max(...pendingCC.map((p) => Math.floor((now - p.createdAt.getTime()) / 86400000)))
    : 0;
  const pendingTotalValue = pendingCC.reduce((s, p) => s + p.grandTotal, 0);

  // ── 2. PO funnel ────────────────────────────────────────────────────
  const funnel = await db.purchaseOrder.groupBy({
    by: ["status"],
    where: { createdAt: { gte: ninetyDaysAgo } },
    _count: { _all: true },
    _sum: { grandTotal: true },
  });
  const funnelByStatus = new Map(funnel.map((f) => [f.status, f]));
  const FUNNEL_STAGES = [
    { key: "DRAFT", label: "Draft" },
    { key: "PENDING_CC_APPROVAL", label: "Pending CC" },
    { key: "APPROVED", label: "Approved" },
    { key: "SENT", label: "Sent" },
    { key: "PARTIALLY_RECEIVED", label: "Partial GRN" },
    { key: "CLOSED", label: "Closed" },
    { key: "REJECTED", label: "Rejected" },
    { key: "CANCELLED", label: "Cancelled" },
  ];

  // ── 3. Recent rejections ────────────────────────────────────────────
  const rejections = await db.purchaseOrder.findMany({
    where: { status: "REJECTED", ccApprovedAt: { gte: ninetyDaysAgo } },
    include: { supplier: { select: { name: true } }, outlet: { select: { name: true } } },
    orderBy: { ccApprovedAt: "desc" },
    take: 20,
  });

  // ── 4. AP aging (chain-wide unpaid + partial vendor invoices) ───────
  const unpaid = await db.vendorInvoice.findMany({
    where: { status: { in: ["UNPAID", "PARTIAL"] } },
    include: { supplier: { select: { name: true } }, outlet: { select: { name: true } } },
    orderBy: { invoiceDate: "asc" },
  });
  const aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  for (const i of unpaid) {
    const days = Math.floor((now - i.invoiceDate.getTime()) / 86400000);
    const due = i.grandTotal - i.amountPaid;
    if (days <= 30) aging.d0_30 += due;
    else if (days <= 60) aging.d31_60 += due;
    else if (days <= 90) aging.d61_90 += due;
    else aging.d90plus += due;
  }
  const totalOutstanding = Object.values(aging).reduce((s, v) => s + v, 0);

  // ── 5. Top suppliers by spend (last 90d) ────────────────────────────
  const recentInvoices = await db.vendorInvoice.findMany({
    where: { invoiceDate: { gte: ninetyDaysAgo } },
    select: { supplierId: true, grandTotal: true, supplier: { select: { name: true } } },
  });
  const supplierSpend = new Map<string, { name: string; total: number; count: number }>();
  for (const inv of recentInvoices) {
    const cur = supplierSpend.get(inv.supplierId) ?? { name: inv.supplier.name, total: 0, count: 0 };
    cur.total += inv.grandTotal;
    cur.count += 1;
    supplierSpend.set(inv.supplierId, cur);
  }
  const topSuppliers = Array.from(supplierSpend.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);

  // Hydrate rejection actor names.
  const rejActorIds = rejections.map((r) => r.ccApprovedById).filter(Boolean) as string[];
  const rejActors = rejActorIds.length
    ? new Map(
        (await db.user.findMany({ where: { id: { in: rejActorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name])
      )
    : new Map();

  return (
    <div>
      <PageHeader
        title="Procurement cockpit"
        description="Chain-wide procurement health — POs, approvals, rejections, AP"
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/inventory/purchase?status=pending-cc">
              <Clock className="h-4 w-4" />
              Open CC queue
            </Link>
          </Button>
        }
      />

      {/* Top KPI strip */}
      <StatGrid cols={4} className="mb-4">
        <StatCard
          label="Pending CC"
          value={pendingCC.length}
          subline={`${inr(pendingTotalValue)} on the queue`}
          tone={pendingCC.length > 5 ? "warn" : "neutral"}
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label="Oldest pending"
          value={oldestPendingDays > 0 ? `${oldestPendingDays}d` : "—"}
          subline={oldestPendingDays >= 3 ? "Take a look — ageing" : "Within SLA"}
          tone={oldestPendingDays >= 3 ? "bad" : oldestPendingDays > 0 ? "warn" : "good"}
          icon={<AlertCircle className="h-4 w-4" />}
        />
        <StatCard
          label="Outstanding AP"
          value={inr(Math.round(totalOutstanding))}
          subline={`${unpaid.length} open invoices`}
          tone={aging.d90plus > 0 ? "bad" : aging.d61_90 > 0 ? "warn" : "neutral"}
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          label="90d spend"
          value={inr(Math.round(recentInvoices.reduce((s, i) => s + i.grandTotal, 0)))}
          subline={`${recentInvoices.length} invoices · ${topSuppliers.length} suppliers`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </StatGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* PO funnel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">PO funnel — last 90 days</CardTitle>
            <CardDescription>Counts + value by status</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {FUNNEL_STAGES.map((s) => {
                  const f = funnelByStatus.get(s.key);
                  const n = f?._count._all ?? 0;
                  const v = f?._sum.grandTotal ?? 0;
                  return (
                    <TableRow key={s.key} className={n === 0 ? "opacity-50" : ""}>
                      <TableCell className="text-sm">{s.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{n}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(Math.round(v))}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* AP aging */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AP aging — chain-wide</CardTitle>
            <CardDescription>Outstanding stock purchases by age</CardDescription>
          </CardHeader>
          <CardContent>
            <StatGrid cols={2} className="mb-3">
              <StatCard label="0–30 days" value={inr(Math.round(aging.d0_30))} />
              <StatCard label="31–60 days" value={inr(Math.round(aging.d31_60))} tone={aging.d31_60 > 0 ? "warn" : "neutral"} />
              <StatCard label="61–90 days" value={inr(Math.round(aging.d61_90))} tone={aging.d61_90 > 0 ? "bad" : "neutral"} />
              <StatCard label="90+ days" value={inr(Math.round(aging.d90plus))} tone={aging.d90plus > 0 ? "bad" : "neutral"} />
            </StatGrid>
            <div className="text-xs text-muted-foreground">
              <Link href="/inventory/invoices" className="underline-offset-2 hover:underline">
                Open invoices →
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending CC table */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pending Cost Controller approval ({pendingCC.length})</CardTitle>
          <CardDescription>POs raised but not yet approved or rejected</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {pendingCC.length === 0 ? (
            <Empty title="Queue empty" desc="Every recent PO has been actioned." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO</TableHead>
                  <TableHead>Outlet</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Age</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingCC.map((p) => {
                  const days = Math.floor((now - p.createdAt.getTime()) / 86400000);
                  return (
                    <TableRow key={p.id} className="hover:bg-accent/30">
                      <TableCell>
                        <Link href={`/inventory/purchase/${p.id}`} className="font-mono text-xs hover:underline">
                          {p.poNo}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{p.outlet.name}</TableCell>
                      <TableCell className="text-sm">{p.supplier.name}</TableCell>
                      <TableCell className="text-right font-medium">{inr(Math.round(p.grandTotal))}</TableCell>
                      <TableCell>
                        <Badge variant={days >= 3 ? "destructive" : days >= 1 ? "warning" : "secondary"} className="text-[10px]">
                          {days === 0 ? "today" : `${days}d`}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent rejections */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent rejections ({rejections.length})</CardTitle>
            <CardDescription>Last 90 days · reasons explain CC reasoning</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {rejections.length === 0 ? (
              <Empty title="None" desc="No POs rejected in the last 90 days." />
            ) : (
              <ul className="divide-y">
                {rejections.map((r) => (
                  <li key={r.id} className="p-3 flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-rose-700 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <Link href={`/inventory/purchase/${r.id}`} className="font-mono text-xs hover:underline">
                          {r.poNo}
                        </Link>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-xs">{r.outlet.name}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-xs">{r.supplier.name}</span>
                      </div>
                      <div className="text-sm text-rose-800 mt-1">{r.ccRejectionReason}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {fmtDate(r.ccApprovedAt)}
                        {r.ccApprovedById && (
                          <> by {rejActors.get(r.ccApprovedById) ?? "—"}</>
                        )}
                        {" · "}
                        {inr(Math.round(r.grandTotal))}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Top suppliers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top suppliers (90d spend)</CardTitle>
            <CardDescription>By invoice value</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {topSuppliers.length === 0 ? (
              <Empty title="No spend" desc="No stock purchases recorded in the last 90 days." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topSuppliers.map(([id, s]) => (
                    <TableRow key={id}>
                      <TableCell className="text-sm">{s.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {inr(Math.round(s.total))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
