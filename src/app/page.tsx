import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/utils";
import { getActiveOutlet } from "@/lib/outlet";
import { dashboardKpis, type RangeKey } from "@/lib/analytics";
import { getSessionUser } from "@/lib/session";
import { landingPathFor } from "@/lib/role-landing";
import {
  ArrowUpRight,
  Banknote,
  CreditCard,
  Smartphone,
  Globe2,
  Utensils,
  PackageCheck,
  Truck,
  TrendingUp,
  AlertCircle,
  Wallet,
} from "lucide-react";
import { TrendChart, HourlyChart } from "./_components/charts";
import { RangePicker } from "./_components/range-picker";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: RangeKey }> }) {
  // Role-aware landing — if the signed-in user isn't an OWNER/MANAGER, send
  // them to their natural work surface (HOD → requisitions, SM → approval
  // queue, CC → pending POs, Accountant → GRN, etc.). The operations
  // dashboard below is for OWNER + MANAGER only.
  const user = await getSessionUser();
  if (user) {
    const landing = landingPathFor(user.role);
    if (landing !== "/") redirect(landing);
  }

  const sp = await searchParams;
  const range = (sp.range ?? "last7") as RangeKey;
  const outlet = await getActiveOutlet();
  const k = await dashboardKpis(outlet.id, range);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Snapshot for ${k.label.toLowerCase()} — ${outlet.name}`}
        actions={<RangePicker current={range} />}
      />

      {/* Row 1 — top KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KpiCard
          title="Total Sales"
          value={inr(k.totals.sales)}
          subline={`${k.totals.orders} orders · AOV ${inr(k.totals.avgOrderValue)}`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          title="Net Profit"
          value={inr(k.totals.netProfit)}
          subline={`Expenses ${inr(k.totals.expenses)}`}
          icon={<Wallet className="h-4 w-4" />}
          tone={k.totals.netProfit >= 0 ? "good" : "bad"}
        />
        <KpiCard
          title="Taxes Collected"
          value={inr(k.totals.tax)}
          subline="GST output"
          icon={<ArrowUpRight className="h-4 w-4" />}
        />
        <KpiCard
          title="Cancelled Orders"
          value={String(k.statusCounts.cancelled)}
          subline={k.statusCounts.cancelled > 0 ? "In range" : "All good in this range"}
          icon={<AlertCircle className="h-4 w-4" />}
          tone={k.statusCounts.cancelled > 0 ? "warn" : "neutral"}
        />
      </div>

      {/* Row 2 — payment split + order type split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sales by payment</CardTitle>
            <CardDescription>Where the money came from</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <PayCell icon={<Banknote className="h-4 w-4" />} label="Cash" value={k.payments.cash} />
            <PayCell icon={<CreditCard className="h-4 w-4" />} label="Card" value={k.payments.card} />
            <PayCell icon={<Smartphone className="h-4 w-4" />} label="UPI" value={k.payments.upi} />
            <PayCell icon={<Globe2 className="h-4 w-4" />} label="Online" value={k.payments.online} />
            <PayCell icon={<AlertCircle className="h-4 w-4" />} label="Due" value={k.payments.other} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Order types</CardTitle>
            <CardDescription>Breakdown by channel</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <TypeRow icon={<Utensils className="h-4 w-4" />} label="Dine in" {...k.byType.dineIn} />
            <TypeRow icon={<PackageCheck className="h-4 w-4" />} label="Pickup" {...k.byType.pickup} />
            <TypeRow icon={<Truck className="h-4 w-4" />} label="Delivery" {...k.byType.delivery} />
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sales — last 7 days</CardTitle>
            <CardDescription>Daily revenue trend</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={k.trend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Hourly orders</CardTitle>
            <CardDescription>Today vs typical</CardDescription>
          </CardHeader>
          <CardContent>
            <HourlyChart data={k.hourly} />
          </CardContent>
        </Card>
      </div>

      {/* Row 4 — leakage placeholder + quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Leakage tracker</CardTitle>
            <CardDescription>Modified bills, cancelled KOTs, waived amounts — anti-theft</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Leak label="KOTs cancelled" value="0" />
            <Leak label="KOTs modified" value="0" />
            <Leak label="Bills reprinted" value="0" />
            <Leak label="Waived ₹" value="₹0" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Onboarding</CardTitle>
            <CardDescription>3 / 5 steps completed</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-2 w-full bg-muted rounded overflow-hidden mb-3">
              <div className="h-full bg-primary" style={{ width: "60%" }} />
            </div>
            <ul className="text-sm space-y-1.5">
              <Step done>Set up outlet</Step>
              <Step done>Add menu items</Step>
              <Step done>Seed sample data</Step>
              <Step>Connect a printer</Step>
              <Step>Invite a biller</Step>
            </ul>
            <Button size="sm" className="mt-4 w-full">
              Continue setup
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  subline,
  icon,
  tone = "neutral",
}: {
  title: string;
  value: string;
  subline?: string;
  icon: React.ReactNode;
  tone?: "good" | "bad" | "warn" | "neutral";
}) {
  const tones: Record<string, string> = {
    good: "text-emerald-600",
    bad: "text-rose-600",
    warn: "text-amber-600",
    neutral: "text-foreground",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">{title}</span>
          <span className="h-7 w-7 rounded-md bg-muted flex items-center justify-center text-muted-foreground">{icon}</span>
        </div>
        <div className={`text-2xl font-semibold tracking-tight ${tones[tone]}`}>{value}</div>
        {subline && <div className="text-xs text-muted-foreground mt-1">{subline}</div>}
      </CardContent>
    </Card>
  );
}

function PayCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="border rounded-md p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon} {label}
      </div>
      <div className="font-semibold">{inr(value)}</div>
    </div>
  );
}

function TypeRow({ icon, label, count, total }: { icon: React.ReactNode; label: string; count: number; total: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="inline-flex items-center gap-2">
        {icon} {label}
      </span>
      <span className="text-right">
        <div className="font-medium">{inr(total)}</div>
        <div className="text-xs text-muted-foreground">{count} orders</div>
      </span>
    </div>
  );
}

function Leak({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold text-lg mt-1">{value}</div>
    </div>
  );
}

function Step({ children, done }: { children: React.ReactNode; done?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`h-4 w-4 rounded-full flex items-center justify-center text-[10px] ${done ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
        {done ? "✓" : "•"}
      </span>
      <span className={done ? "text-muted-foreground line-through" : ""}>{children}</span>
    </li>
  );
}
