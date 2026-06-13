import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { getSessionUser } from "@/lib/session";
import { ownedDepartmentKind } from "@/lib/rbac";
import { inr } from "@/lib/utils";
import { HodDashboard } from "./hod-dashboard";
import {
  AlertTriangle,
  Boxes,
  CalendarCheck,
  Receipt,
  TrendingDown,
  ClipboardList,
  PackageCheck,
  FileText,
  BarChart3,
  Network,
} from "lucide-react";

export const dynamic = "force-dynamic";

function midnight(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }

export default async function InventoryDashboardPage() {
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  // HODs get a completely different page — the focused box-#4 view that
  // only surfaces their dept's stock, alerts, replenishment list, and
  // their own pending requisitions. Manager / Owner / Accountant /
  // Store Manager etc. fall through to the procurement-style overview
  // built for the inventory super-users.
  const hodKind = user ? ownedDepartmentKind(user.role) : null;
  if (user && hodKind && hodKind !== "STORE") {
    return (
      <HodDashboard
        outletId={outlet.id}
        outletName={outlet.name}
        user={{ id: user.id, name: user.name, role: user.role, departmentId: user.departmentId ?? null }}
        deptKind={hodKind}
      />
    );
  }
  const today = midnight(new Date());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const week7 = new Date(today.getTime() - 7 * 86400000);

  const [rms, counts, purchases, pendingPos] = await Promise.all([
    db.rawMaterial.findMany({ where: { outletId: outlet.id, active: true } }),
    db.stockCount.findMany({
      where: { outletId: outlet.id, businessDay: { gte: monthStart, lte: today }, countType: "DAY_END" },
      select: { businessDay: true, frozen: true },
    }),
    db.purchase.findMany({
      where: { outletId: outlet.id, createdAt: { gte: week7 } },
      include: { supplier: true },
    }),
    db.purchaseOrder.findMany({
      where: { outletId: outlet.id, status: { in: ["DRAFT", "SENT"] } },
      include: { supplier: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const totalValue = rms.reduce((s, r) => s + r.currentQty * (r.avgCost || r.purchasePrice || 0), 0);
  const belowMin = rms.filter((r) => r.currentQty < r.minLevel);
  const belowPar = rms.filter((r) => r.currentQty < r.parLevel && r.currentQty >= r.minLevel);
  const last7Purch = purchases.reduce((s, p) => s + p.grandTotal, 0);
  const last7Due = purchases.reduce((s, p) => s + (p.grandTotal - p.amountPaid), 0);

  // Daily Stock Closing Tracker — calendar for current month
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const countByDay = new Set(counts.map((c) => c.businessDay.toISOString().slice(0, 10)));
  const calCells: { day: number; date: string; recorded: boolean }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(today.getFullYear(), today.getMonth(), d).toISOString().slice(0, 10);
    calCells.push({ day: d, date, recorded: countByDay.has(date) });
  }
  const accuracy = daysInMonth ? Math.round((counts.length / daysInMonth) * 100) : 0;
  const missed = Math.min(daysInMonth, Math.max(0, today.getDate() - counts.length));

  // Chain workflow KPIs for the quick-link strip — keep these cheap, they
  // run on every render of /inventory/dashboard.
  const [pendingReqCount, openGrnCount, openInvoiceCount, pendingCcCount] = await Promise.all([
    db.requisition.count({ where: { outletId: outlet.id, status: "NEW" } }),
    db.grn.count({ where: { outletId: outlet.id, status: "OPEN" } }),
    db.vendorInvoice.count({ where: { outletId: outlet.id, status: { in: ["UNPAID", "PARTIAL"] } } }),
    db.purchaseOrder.count({ where: { outletId: outlet.id, status: "PENDING_CC_APPROVAL" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Inventory Dashboard"
        description={`${outlet.name} · live snapshot of stock health`}
      />

      {/* Chain workflow quick-link strip — surfaces the new procurement +
          requisition surfaces so they're not buried in the sidebar. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        <QuickLink
          href="/inventory/requisitions"
          icon={<ClipboardList className="h-4 w-4" />}
          label="Requisitions"
          badge={pendingReqCount}
          badgeTone={pendingReqCount > 0 ? "warn" : "neutral"}
        />
        <QuickLink
          href="/inventory/purchase"
          icon={<Receipt className="h-4 w-4" />}
          label="Purchase orders"
          badge={pendingCcCount}
          badgeTone={pendingCcCount > 0 ? "warn" : "neutral"}
          badgeLabel="pending CC"
        />
        <QuickLink
          href="/inventory/grn"
          icon={<PackageCheck className="h-4 w-4" />}
          label="Goods received"
          badge={openGrnCount}
          badgeTone="neutral"
          badgeLabel="open"
        />
        <QuickLink
          href="/inventory/invoices"
          icon={<FileText className="h-4 w-4" />}
          label="Vendor invoices"
          badge={openInvoiceCount}
          badgeTone={openInvoiceCount > 0 ? "warn" : "neutral"}
          badgeLabel="unpaid"
        />
        <QuickLink
          href="/inventory/reports/procurement-cockpit"
          icon={<BarChart3 className="h-4 w-4" />}
          label="Procurement cockpit"
        />
        <QuickLink
          href="/inventory/reports/chain-stock"
          icon={<Network className="h-4 w-4" />}
          label="Chain stock"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Daily Stock Closing Tracker */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base inline-flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-emerald-600" />
              Daily Stock Closing Tracker
            </CardTitle>
            <CardDescription>
              {accuracy}% accuracy · updated on {counts.length} day{counts.length === 1 ? "" : "s"} this month
              {missed > 0 && <> · <span className="text-rose-700">{missed} day{missed === 1 ? "" : "s"} missed</span></>}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1">
              {calCells.map((c) => (
                <Link
                  key={c.date}
                  href={`/inventory/closing?date=${c.date}`}
                  className={`h-9 rounded grid place-items-center text-xs border ${
                    c.recorded
                      ? "bg-emerald-100 border-emerald-300 text-emerald-800 font-medium"
                      : "bg-muted/30 border-border text-muted-foreground hover:border-primary"
                  }`}
                  title={c.recorded ? "Closing recorded" : "Not recorded"}
                >
                  {c.day}
                </Link>
              ))}
            </div>
            <div className="mt-3">
              <Link href={`/inventory/closing?date=${today.toISOString().slice(0,10)}`}>
                <span className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                  Update today's closing →
                </span>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Current Inventory ₹ */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base inline-flex items-center gap-2">
              <Boxes className="h-4 w-4 text-amber-600" />
              Current Inventory
            </CardTitle>
            <CardDescription>On-hand value across all raw materials</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inr(Math.round(totalValue))}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <Link href="/inventory/available" className="rounded-md border bg-amber-50 p-2 hover:border-amber-400">
                <div className="text-[10px] uppercase tracking-wider text-amber-700">Below Par</div>
                <div className="font-semibold text-amber-800">{belowPar.length}</div>
              </Link>
              <Link href="/inventory/available" className="rounded-md border bg-rose-50 p-2 hover:border-rose-400">
                <div className="text-[10px] uppercase tracking-wider text-rose-700">Below Min</div>
                <div className="font-semibold text-rose-800">{belowMin.length}</div>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Low Stock Alert */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base inline-flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {belowMin.length === 0 && belowPar.length === 0 ? (
              <div className="text-sm text-muted-foreground">All raw materials above par level.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-rose-700 mb-1">Below min</div>
                  <ul className="space-y-1 text-sm">
                    {belowMin.slice(0, 5).map((r) => (
                      <li key={r.id} className="flex justify-between">
                        <span>{r.name}</span>
                        <span className="text-rose-700 font-medium">{r.currentQty}/{r.minLevel}</span>
                      </li>
                    ))}
                    {belowMin.length === 0 && <li className="text-xs text-muted-foreground">none</li>}
                  </ul>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-amber-700 mb-1">Below par</div>
                  <ul className="space-y-1 text-sm">
                    {belowPar.slice(0, 5).map((r) => (
                      <li key={r.id} className="flex justify-between">
                        <span>{r.name}</span>
                        <span className="text-amber-700 font-medium">{r.currentQty}/{r.parLevel}</span>
                      </li>
                    ))}
                    {belowPar.length === 0 && <li className="text-xs text-muted-foreground">none</li>}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Purchase Insights */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base inline-flex items-center gap-2">
              <Receipt className="h-4 w-4 text-emerald-600" />
              Purchase Insights · 7d
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Purchases</span><span className="font-semibold">{inr(last7Purch)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Due payment</span><span className="font-semibold text-amber-700">{inr(last7Due)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Records</span><span>{purchases.length}</span></div>
          </CardContent>
        </Card>

        {/* Pending POs */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base inline-flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-blue-600" />
              Pending Purchase Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingPos.length === 0 ? (
              <div className="text-sm text-muted-foreground">No POs in flight.</div>
            ) : (
              <ul className="space-y-1 text-sm">
                {pendingPos.map((p) => (
                  <li key={p.id} className="flex justify-between border-b last:border-0 py-1">
                    <span>
                      <span className="font-mono text-xs">{p.poNo}</span> · {p.supplier.name}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">{inr(p.grandTotal)}</span>
                      <Badge variant={p.status === "DRAFT" ? "secondary" : "warning"} className="text-[10px]">{p.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  label,
  badge,
  badgeLabel,
  badgeTone = "neutral",
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  badgeLabel?: string;
  badgeTone?: "neutral" | "warn";
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-2 rounded-md border bg-card hover:bg-accent transition-colors px-3 py-2 text-sm"
    >
      <span className="inline-flex items-center gap-2 min-w-0">
        <span className="text-muted-foreground group-hover:text-foreground shrink-0">
          {icon}
        </span>
        <span className="font-medium truncate">{label}</span>
      </span>
      {badge !== undefined && badge > 0 && (
        <Badge
          variant={badgeTone === "warn" ? "warning" : "outline"}
          className="text-[10px] shrink-0"
        >
          {badge}
          {badgeLabel && ` ${badgeLabel}`}
        </Badge>
      )}
    </Link>
  );
}
