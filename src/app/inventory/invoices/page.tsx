import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, AlertCircle, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "UNPAID", label: "Unpaid", filter: ["UNPAID"] },
  { key: "PARTIAL", label: "Partial", filter: ["PARTIAL"] },
  { key: "PAID", label: "Paid", filter: ["PAID"] },
  { key: "ALL", label: "All", filter: null as null | string[] },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function VendorInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: TabKey }>;
}) {
  const sp = await searchParams;
  const tab = (sp.tab ?? "UNPAID") as TabKey;
  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0];
  const outlet = await getActiveOutlet();

  const where = {
    outletId: outlet.id,
    ...(activeTab.filter ? { status: { in: activeTab.filter as unknown as string[] } } : {}),
  };
  const [invoices, counts] = await Promise.all([
    db.vendorInvoice.findMany({
      where,
      include: { supplier: { select: { name: true } }, grnLinks: { select: { grnId: true } } },
      orderBy: { invoiceDate: "desc" },
      take: 200,
    }),
    Promise.all(
      TABS.map(async (t) => ({
        key: t.key,
        n: await db.vendorInvoice.count({
          where: {
            outletId: outlet.id,
            ...(t.filter ? { status: { in: t.filter as unknown as string[] } } : {}),
          },
        }),
      }))
    ),
  ]);
  const countByKey = Object.fromEntries(counts.map((c) => [c.key, c.n]));

  // Compute aging buckets for unpaid invoices
  const now = Date.now();
  const aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  for (const inv of invoices) {
    if (inv.status === "PAID") continue;
    const days = Math.floor((now - inv.invoiceDate.getTime()) / 86400000);
    const due = inv.grandTotal - inv.amountPaid;
    if (days <= 30) aging.d0_30 += due;
    else if (days <= 60) aging.d31_60 += due;
    else if (days <= 90) aging.d61_90 += due;
    else aging.d90plus += due;
  }

  return (
    <div>
      <PageHeader
        title="Vendor invoices"
        description="Accounts payable — invoices from suppliers against GRNs received"
        actions={
          <Button asChild size="sm">
            <Link href="/inventory/invoices/new">
              <Plus className="h-4 w-4" />
              New invoice
            </Link>
          </Button>
        }
      />

      {/* Aging strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <AgeCell label="0–30 days" value={aging.d0_30} tone="neutral" />
        <AgeCell label="31–60 days" value={aging.d31_60} tone="amber" />
        <AgeCell label="61–90 days" value={aging.d61_90} tone="rose" />
        <AgeCell label="90+ days" value={aging.d90plus} tone="rose-dark" />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {TABS.map((t) => {
          const active = t.key === activeTab.key;
          const n = countByKey[t.key] ?? 0;
          return (
            <Link
              key={t.key}
              href={t.key === "UNPAID" ? "/inventory/invoices" : `/inventory/invoices?tab=${t.key}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
                active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"
              }`}
            >
              {t.label}
              <Badge variant="outline" className="text-[10px] bg-background/50">
                {n}
              </Badge>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <Empty
              title="No invoices yet"
              desc="Open a GRN and click 'Record vendor invoice' to start tracking AP."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">GRNs</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const remaining = inv.grandTotal - inv.amountPaid;
                  return (
                    <TableRow key={inv.id} className="hover:bg-accent/40">
                      <TableCell>
                        <Link href={`/inventory/invoices/${inv.id}`} className="font-mono text-xs hover:underline">
                          {inv.invoiceNo}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {inv.invoiceDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                      </TableCell>
                      <TableCell className="text-sm">{inv.supplier.name}</TableCell>
                      <TableCell className="text-right">{inv.grnLinks.length}</TableCell>
                      <TableCell className="text-right font-medium">{inr(Math.round(inv.grandTotal))}</TableCell>
                      <TableCell className="text-right">
                        {remaining > 0 ? (
                          <span className="font-semibold text-rose-700">{inr(Math.round(remaining))}</span>
                        ) : (
                          <span className="text-emerald-700">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            inv.status === "PAID"
                              ? "success"
                              : inv.status === "PARTIAL"
                                ? "warning"
                                : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {inv.status}
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
    </div>
  );
}

function AgeCell({ label, value, tone }: { label: string; value: number; tone: "neutral" | "amber" | "rose" | "rose-dark" }) {
  const palette: Record<string, string> = {
    neutral: "bg-card border-border",
    amber: "bg-amber-50 border-amber-300 text-amber-900",
    rose: "bg-rose-50 border-rose-300 text-rose-900",
    "rose-dark": "bg-rose-100 border-rose-400 text-rose-900",
  };
  return (
    <div className={`rounded-md border-2 px-3 py-2 ${palette[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-lg font-semibold leading-none mt-1">{inr(Math.round(value))}</div>
    </div>
  );
}
