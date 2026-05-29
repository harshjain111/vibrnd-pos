import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inr } from "@/lib/utils";
import { ArrowLeft, Mail, Phone, MapPin, Hash } from "lucide-react";
import { SpendChart } from "./chart";
import { tierFor } from "@/lib/loyalty";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const outlet = await getActiveOutlet();
  const customer = await db.customer.findFirst({
    where: { id, outletId: outlet.id },
    include: {
      orders: {
        where: { status: { in: ["PAID", "PRINTED", "DELIVERED"] } },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!customer) return notFound();

  const totalSpend = customer.orders.reduce((s, o) => s + o.grandTotal, 0);
  const totalOrders = customer.orders.length;
  const aov = totalOrders ? totalSpend / totalOrders : 0;
  const lastVisit = customer.orders[0]?.createdAt;

  // Spend per month for last 6 months
  const months: { label: string; spend: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const spend = customer.orders
      .filter((o) => o.createdAt >= start && o.createdAt <= end)
      .reduce((s, o) => s + o.grandTotal, 0);
    months.push({
      label: start.toLocaleDateString("en-IN", { month: "short" }),
      spend,
    });
  }

  // Top items lifetime
  const itemMap = new Map<string, { name: string; qty: number; total: number }>();
  for (const o of customer.orders) {
    for (const li of o.items) {
      const cur = itemMap.get(li.name) ?? { name: li.name, qty: 0, total: 0 };
      cur.qty += li.qty;
      cur.total += li.price * li.qty;
      itemMap.set(li.name, cur);
    }
  }
  const topItems = [...itemMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);

  const tags = customer.tags ? customer.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];

  const tier = tierFor(customer.loyaltyPoints, {
    silverAt: outlet.tierSilverAt,
    goldAt: outlet.tierGoldAt,
    silverMult: outlet.tierSilverMult,
    goldMult: outlet.tierGoldMult,
  });
  const tierTone: "secondary" | "info" | "warning" = tier === "GOLD" ? "warning" : tier === "SILVER" ? "info" : "secondary";

  return (
    <div>
      <PageHeader
        title={customer.name}
        description={`${tier} tier · customer since ${new Date(customer.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/customers">
              <ArrowLeft className="h-4 w-4" />
              All customers
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
        <Kpi label="Lifetime spend" value={inr(totalSpend)} tone="good" />
        <Kpi label="Orders" value={String(totalOrders)} />
        <Kpi label="Avg order value" value={inr(aov)} />
        <Kpi label="Loyalty balance" value={`${customer.loyaltyPoints} pts`} tone="good" />
        <Kpi
          label="Last visit"
          value={
            lastVisit
              ? new Date(lastVisit).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
              : "—"
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Spend trend</CardTitle>
              <CardDescription>Last 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <SpendChart data={months} />
            </CardContent>
          </Card>

          {topItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top items</CardTitle>
                <CardDescription>Most ordered across all visits</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Total spend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topItems.map((t) => (
                      <TableRow key={t.name}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="text-right">{t.qty}</TableCell>
                        <TableCell className="text-right">{inr(t.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Order history</CardTitle>
              <CardDescription>{customer.orders.length} settled orders</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {customer.orders.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">No orders yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customer.orders.slice(0, 20).map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs">
                          <Link href={`/orders/${o.id}`} className="hover:underline">
                            {o.invoiceNo}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(o.createdAt).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>{o.orderType.replace("_", " ")}</TableCell>
                        <TableCell className="text-muted-foreground">{o.channel}</TableCell>
                        <TableCell className="text-right">{o.items.length}</TableCell>
                        <TableCell className="text-right font-medium">{inr(o.grandTotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm p-4 pt-0">
              {customer.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono">{customer.phone}</span>
                </div>
              )}
              {customer.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{customer.email}</span>
                </div>
              )}
              {customer.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span>{customer.address}</span>
                </div>
              )}
              {customer.gstin && (
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs">{customer.gstin}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tags</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <Badge key={t} variant="outline">
                      {t}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold mt-0.5 ${tone === "good" ? "text-emerald-700" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
