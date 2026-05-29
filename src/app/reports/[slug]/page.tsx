import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { rangeBounds, type RangeKey } from "@/lib/analytics";
import { RangePicker } from "@/app/_components/range-picker";
import { Bell, Download, Star } from "lucide-react";
import { findReport } from "../registry";

export const dynamic = "force-dynamic";

import { requireUser } from "@/lib/rbac";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: RangeKey }>;
}) {
  await requireUser("MANAGER");
  const { slug } = await params;
  const sp = await searchParams;
  const range = (sp.range ?? "last7") as RangeKey;
  const { from, to, label } = rangeBounds(range);
  const outlet = await getActiveOutlet();

  const orders = await db.order.findMany({
    where: { outletId: outlet.id, status: { in: ["PAID", "PRINTED"] }, createdAt: { gte: from, lte: to } },
    include: { items: { include: { item: { include: { category: true } } } }, customer: true },
  });

  // Span the same window again but ending at `from` for period-over-period
  const prevWindowMs = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - prevWindowMs);
  const prevOrders = await db.order.findMany({
    where: { outletId: outlet.id, status: { in: ["PAID", "PRINTED"] }, createdAt: { gte: prevFrom, lt: from } },
  });

  const cancelledOrders = await db.order.findMany({
    where: { outletId: outlet.id, status: "CANCELLED", createdAt: { gte: from, lte: to } },
    include: { items: true, customer: true },
    orderBy: { createdAt: "desc" },
  });

  // Captains lookup — used by the captain-performance report
  const captainIds = Array.from(new Set(orders.map((o) => o.captainId).filter(Boolean) as string[]));
  const captainUsers = await db.user.findMany({ where: { id: { in: captainIds } } });
  const captainMap = new Map(captainUsers.map((u) => [u.id, u]));

  const REPORTS: Record<string, { title: string; desc: string; render: () => React.ReactNode }> = {
    "sales-summary": {
      title: "Sales summary",
      desc: "Day-wise revenue, tax, discount, net",
      render: () => {
        const byDay = new Map<string, { sales: number; tax: number; discount: number; orders: number }>();
        for (const o of orders) {
          const d = new Date(o.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
          const cur = byDay.get(d) ?? { sales: 0, tax: 0, discount: 0, orders: 0 };
          cur.sales += o.grandTotal;
          cur.tax += o.taxTotal;
          cur.discount += o.discount;
          cur.orders += 1;
          byDay.set(d, cur);
        }
        const rows = [...byDay.entries()];
        const totals = rows.reduce(
          (acc, [, v]) => ({
            sales: acc.sales + v.sales,
            tax: acc.tax + v.tax,
            discount: acc.discount + v.discount,
            orders: acc.orders + v.orders,
          }),
          { sales: 0, tax: 0, discount: 0, orders: 0 }
        );
        return (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Discount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(([d, v]) => (
                <TableRow key={d}>
                  <TableCell>{d}</TableCell>
                  <TableCell className="text-right">{v.orders}</TableCell>
                  <TableCell className="text-right font-medium">{inr(v.sales)}</TableCell>
                  <TableCell className="text-right">{inr(v.tax)}</TableCell>
                  <TableCell className="text-right">{inr(v.discount)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{totals.orders}</TableCell>
                <TableCell className="text-right">{inr(totals.sales)}</TableCell>
                <TableCell className="text-right">{inr(totals.tax)}</TableCell>
                <TableCell className="text-right">{inr(totals.discount)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        );
      },
    },
    "item-wise": {
      title: "Item-wise sales",
      desc: "Top items by quantity sold and revenue",
      render: () => {
        const map = new Map<string, { name: string; qty: number; revenue: number }>();
        for (const o of orders) {
          for (const li of o.items) {
            const key = li.itemId;
            const cur = map.get(key) ?? { name: li.name, qty: 0, revenue: 0 };
            cur.qty += li.qty;
            cur.revenue += li.qty * li.price;
            map.set(key, cur);
          }
        }
        const rows = [...map.values()].sort((a, b) => b.revenue - a.revenue);
        return (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty sold</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Avg price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{r.qty}</TableCell>
                  <TableCell className="text-right font-medium">{inr(r.revenue)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{inr(r.revenue / Math.max(1, r.qty))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        );
      },
    },
    "category-wise": {
      title: "Category-wise sales",
      desc: "Sales rolled up by category",
      render: () => {
        const map = new Map<string, { revenue: number; qty: number }>();
        for (const o of orders) {
          for (const li of o.items) {
            const cat = li.item.category.name;
            const cur = map.get(cat) ?? { revenue: 0, qty: 0 };
            cur.revenue += li.qty * li.price;
            cur.qty += li.qty;
            map.set(cat, cur);
          }
        }
        const rows = [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
        const total = rows.reduce((s, [, v]) => s + v.revenue, 0);
        return (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Items sold</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">% of sales</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(([cat, v]) => (
                <TableRow key={cat}>
                  <TableCell className="font-medium">{cat}</TableCell>
                  <TableCell className="text-right">{v.qty}</TableCell>
                  <TableCell className="text-right">{inr(v.revenue)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{((v.revenue / Math.max(1, total)) * 100).toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        );
      },
    },
    "payment-mode": {
      title: "Payment mode",
      desc: "Cash / UPI / Card / Online breakdown",
      render: () => {
        const map = new Map<string, { count: number; total: number }>();
        for (const o of orders) {
          const m = o.paymentMode ?? "—";
          const cur = map.get(m) ?? { count: 0, total: 0 };
          cur.count += 1;
          cur.total += o.grandTotal;
          map.set(m, cur);
        }
        const total = [...map.values()].reduce((s, v) => s + v.total, 0);
        return (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">% of sales</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...map.entries()].map(([m, v]) => (
                <TableRow key={m}>
                  <TableCell className="font-medium">{m}</TableCell>
                  <TableCell className="text-right">{v.count}</TableCell>
                  <TableCell className="text-right">{inr(v.total)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{((v.total / Math.max(1, total)) * 100).toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        );
      },
    },
    "customer-spend": {
      title: "Customer spend",
      desc: "Lifetime spend per customer",
      render: () => {
        const map = new Map<string, { name: string; phone: string; orders: number; spend: number }>();
        for (const o of orders) {
          if (!o.customer) continue;
          const cur = map.get(o.customerId!) ?? {
            name: o.customer.name,
            phone: o.customer.phone ?? "—",
            orders: 0,
            spend: 0,
          };
          cur.orders += 1;
          cur.spend += o.grandTotal;
          map.set(o.customerId!, cur);
        }
        const rows = [...map.values()].sort((a, b) => b.spend - a.spend);
        if (rows.length === 0) {
          return <div className="p-6 text-sm text-muted-foreground text-center">No customer-attributed orders in range.</div>;
        }
        return (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">AOV</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.phone}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.phone}</TableCell>
                  <TableCell className="text-right">{r.orders}</TableCell>
                  <TableCell className="text-right font-medium">{inr(r.spend)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{inr(r.spend / r.orders)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        );
      },
    },
    "growth": {
      title: "Day-wise growth",
      desc: "Sales and order delta vs the previous equal window",
      render: () => {
        const cur = orders.reduce((s, o) => s + o.grandTotal, 0);
        const prev = prevOrders.reduce((s, o) => s + o.grandTotal, 0);
        const curOrders = orders.length;
        const prevC = prevOrders.length;
        const fmtPct = (curVal: number, prevVal: number) => {
          if (!prevVal) return curVal ? "+∞%" : "0%";
          const d = ((curVal - prevVal) / prevVal) * 100;
          return `${d > 0 ? "+" : ""}${d.toFixed(1)}%`;
        };
        const byDay = new Map<string, number>();
        for (const o of orders) {
          const k = new Date(o.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
          byDay.set(k, (byDay.get(k) ?? 0) + o.grandTotal);
        }
        return (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b">
              <Kpi label="Revenue (current)" value={inr(cur)} />
              <Kpi label="Revenue (previous)" value={inr(prev)} />
              <Kpi label="Revenue Δ" value={fmtPct(cur, prev)} tone={cur >= prev ? "good" : "bad"} />
              <Kpi label="Orders Δ" value={fmtPct(curOrders, prevC)} tone={curOrders >= prevC ? "good" : "bad"} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...byDay.entries()].map(([d, v]) => (
                  <TableRow key={d}>
                    <TableCell>{d}</TableCell>
                    <TableCell className="text-right font-medium">{inr(v)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        );
      },
    },
    "cancelled": {
      title: "Cancelled orders",
      desc: "Voided orders — surfaces anti-theft signals",
      render: () => {
        if (cancelledOrders.length === 0) {
          return <div className="p-6 text-sm text-muted-foreground text-center">No cancellations in this range. 🎉</div>;
        }
        const lost = cancelledOrders.reduce((s, o) => s + o.grandTotal, 0);
        return (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 border-b">
              <Kpi label="Cancelled orders" value={String(cancelledOrders.length)} tone="bad" />
              <Kpi label="Estimated lost revenue" value={inr(lost)} tone="bad" />
              <Kpi label="Avg cancel value" value={inr(lost / cancelledOrders.length)} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cancelledOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.invoiceNo}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(o.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell>{o.orderType.replace("_", " ")}</TableCell>
                    <TableCell className="text-muted-foreground">{o.channel}</TableCell>
                    <TableCell>{o.customer?.name ?? "Walk-in"}</TableCell>
                    <TableCell className="text-right">{o.items.length}</TableCell>
                    <TableCell className="text-right font-medium">{inr(o.grandTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        );
      },
    },
    "hourly-items": {
      title: "Hourly item sales",
      desc: "Top items per hour-of-day bucket",
      render: () => {
        // hour → item → qty
        const grid = new Map<number, Map<string, number>>();
        for (const o of orders) {
          const h = new Date(o.createdAt).getHours();
          if (!grid.has(h)) grid.set(h, new Map());
          const m = grid.get(h)!;
          for (const li of o.items) m.set(li.name, (m.get(li.name) ?? 0) + li.qty);
        }
        const hours = [...grid.keys()].sort((a, b) => a - b);
        if (hours.length === 0) return <div className="p-6 text-sm text-muted-foreground text-center">No data in range.</div>;
        return (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hour</TableHead>
                <TableHead>Top items</TableHead>
                <TableHead className="text-right">Total qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hours.map((h) => {
                const m = grid.get(h)!;
                const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
                const totalQ = [...m.values()].reduce((s, v) => s + v, 0);
                return (
                  <TableRow key={h}>
                    <TableCell className="font-mono">{String(h).padStart(2, "0")}:00 – {String(h).padStart(2, "0")}:59</TableCell>
                    <TableCell className="text-sm">
                      {top.map(([name, qty]) => `${name} ×${qty}`).join(" · ")}
                    </TableCell>
                    <TableCell className="text-right font-medium">{totalQ}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        );
      },
    },
    "discount-report": {
      title: "Discount usage",
      desc: "Coupon redemptions and amount waived",
      render: () => {
        const redeemed = orders.filter((o) => o.discountCode);
        if (redeemed.length === 0) {
          return (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No coupons used in this range.
            </div>
          );
        }
        const map = new Map<string, { count: number; off: number; gross: number }>();
        for (const o of redeemed) {
          const cur = map.get(o.discountCode!) ?? { count: 0, off: 0, gross: 0 };
          cur.count += 1;
          cur.off += o.discount;
          cur.gross += o.grandTotal + o.discount;
          map.set(o.discountCode!, cur);
        }
        const rows = [...map.entries()].sort((a, b) => b[1].off - a[1].off);
        const totalOff = rows.reduce((s, [, v]) => s + v.off, 0);
        const totalGross = rows.reduce((s, [, v]) => s + v.gross, 0);
        return (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 border-b">
              <Kpi label="Redemptions" value={String(redeemed.length)} />
              <Kpi label="Total waived" value={inr(totalOff)} tone="bad" />
              <Kpi label="Effective rate" value={`${((totalOff / Math.max(1, totalGross)) * 100).toFixed(1)}%`} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead className="text-right">Uses</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Waived</TableHead>
                  <TableHead className="text-right">Avg per order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(([code, v]) => (
                  <TableRow key={code}>
                    <TableCell className="font-mono font-semibold">{code}</TableCell>
                    <TableCell className="text-right">{v.count}</TableCell>
                    <TableCell className="text-right">{inr(v.gross)}</TableCell>
                    <TableCell className="text-right text-rose-700">{inr(v.off)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{inr(v.off / v.count)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        );
      },
    },
    "locality": {
      title: "Locality-wise sales",
      desc: "Delivery revenue grouped by locality",
      render: () => {
        const deliveries = orders.filter((o) => o.deliveryAddress || o.locality || o.customer?.address);
        if (deliveries.length === 0) {
          return <div className="p-6 text-sm text-muted-foreground text-center">No delivery orders in this range.</div>;
        }
        // Derive locality: explicit field → last 2 commas of address → "Other"
        const localityOf = (o: typeof deliveries[number]): string => {
          if (o.locality) return o.locality;
          const addr = o.deliveryAddress || o.customer?.address || "";
          const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
          if (parts.length >= 2) return parts.slice(-2)[0];
          if (parts.length === 1) return parts[0];
          return "Unknown";
        };
        const map = new Map<string, { revenue: number; orders: number; items: number }>();
        for (const o of deliveries) {
          const k = localityOf(o);
          const cur = map.get(k) ?? { revenue: 0, orders: 0, items: 0 };
          cur.revenue += o.grandTotal;
          cur.orders += 1;
          cur.items += o.items.length;
          map.set(k, cur);
        }
        const rows = [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
        const total = rows.reduce((s, [, v]) => s + v.revenue, 0);
        return (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Locality</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">% of total</TableHead>
                <TableHead className="text-right">AOV</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(([loc, v]) => (
                <TableRow key={loc}>
                  <TableCell className="font-medium">{loc}</TableCell>
                  <TableCell className="text-right">{v.orders}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{v.items}</TableCell>
                  <TableCell className="text-right">{inr(v.revenue)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{((v.revenue / Math.max(1, total)) * 100).toFixed(1)}%</TableCell>
                  <TableCell className="text-right text-muted-foreground">{inr(v.revenue / Math.max(1, v.orders))}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{deliveries.length}</TableCell>
                <TableCell></TableCell>
                <TableCell className="text-right">{inr(total)}</TableCell>
                <TableCell className="text-right">100%</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        );
      },
    },
    "sub-type": {
      title: "Sub-order type split",
      desc: "Revenue grouped by Dine-in / Pickup / Delivery × sub-type",
      render: () => {
        // group by parent + sub
        const map = new Map<string, { sub: string; parent: string; revenue: number; orders: number; items: number }>();
        for (const o of orders) {
          const sub = o.subOrderType || "(none)";
          const parent = o.orderType.replace("_", " ");
          const k = `${parent}|${sub}`;
          const cur = map.get(k) ?? { sub, parent, revenue: 0, orders: 0, items: 0 };
          cur.revenue += o.grandTotal;
          cur.orders += 1;
          cur.items += o.items.length;
          map.set(k, cur);
        }
        if (map.size === 0) return <div className="p-6 text-sm text-muted-foreground text-center">No data in range.</div>;
        const rows = [...map.values()].sort((a, b) => b.revenue - a.revenue);
        const total = rows.reduce((s, r) => s + r.revenue, 0);
        return (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parent type</TableHead>
                <TableHead>Sub-type</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">% of total</TableHead>
                <TableHead className="text-right">AOV</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.parent}-${r.sub}`}>
                  <TableCell>{r.parent}</TableCell>
                  <TableCell className="font-medium">{r.sub === "(none)" ? <span className="text-muted-foreground">—</span> : r.sub}</TableCell>
                  <TableCell className="text-right">{r.orders}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{r.items}</TableCell>
                  <TableCell className="text-right font-medium">{inr(r.revenue)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{((r.revenue / Math.max(1, total)) * 100).toFixed(1)}%</TableCell>
                  <TableCell className="text-right text-muted-foreground">{inr(r.revenue / Math.max(1, r.orders))}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell colSpan={4}>Total</TableCell>
                <TableCell className="text-right">{inr(total)}</TableCell>
                <TableCell className="text-right">100%</TableCell>
                <TableCell className="text-right">—</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        );
      },
    },
    "captain": {
      title: "Captain performance",
      desc: "Orders + revenue attributed to each captain/biller",
      render: () => {
        const captainOrders = orders.filter((o) => o.captainId);
        if (captainOrders.length === 0) {
          return (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No captain-attributed orders in this range. Pick a captain on the billing screen to start tracking.
            </div>
          );
        }
        const map = new Map<string, { orders: number; revenue: number; tip: number; items: number }>();
        for (const o of captainOrders) {
          const k = o.captainId!;
          const cur = map.get(k) ?? { orders: 0, revenue: 0, tip: 0, items: 0 };
          cur.orders += 1;
          cur.revenue += o.grandTotal;
          cur.tip += o.tip;
          cur.items += o.items.length;
          map.set(k, cur);
        }
        const rows = [...map.entries()]
          .map(([id, v]) => ({ id, user: captainMap.get(id), ...v }))
          .sort((a, b) => b.revenue - a.revenue);
        const grand = rows.reduce(
          (acc, r) => ({
            orders: acc.orders + r.orders,
            revenue: acc.revenue + r.revenue,
            tip: acc.tip + r.tip,
            items: acc.items + r.items,
          }),
          { orders: 0, revenue: 0, tip: 0, items: 0 }
        );
        const grandCommission = rows.reduce(
          (s, r) => s + r.revenue * ((r.user?.commissionRate ?? 0) / 100),
          0
        );
        return (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Tips</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead className="text-right">Avg ticket</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const rate = r.user?.commissionRate ?? 0;
                const commission = r.revenue * (rate / 100);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.user?.name ?? <span className="text-muted-foreground">Unknown</span>}</TableCell>
                    <TableCell className="text-muted-foreground">{r.user?.role ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.orders}</TableCell>
                    <TableCell className="text-right">{r.items}</TableCell>
                    <TableCell className="text-right font-medium">{inr(r.revenue)}</TableCell>
                    <TableCell className="text-right text-emerald-700">{r.tip > 0 ? inr(r.tip) : "—"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{rate > 0 ? `${rate}%` : "—"}</TableCell>
                    <TableCell className="text-right text-emerald-700">{commission > 0 ? inr(commission) : "—"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{inr(r.revenue / r.orders)}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell></TableCell>
                <TableCell className="text-right">{grand.orders}</TableCell>
                <TableCell className="text-right">{grand.items}</TableCell>
                <TableCell className="text-right">{inr(grand.revenue)}</TableCell>
                <TableCell className="text-right">{inr(grand.tip)}</TableCell>
                <TableCell></TableCell>
                <TableCell className="text-right">{inr(grandCommission)}</TableCell>
                <TableCell className="text-right">{inr(grand.revenue / Math.max(1, grand.orders))}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        );
      },
    },
    "tip-report": {
      title: "Tip summary",
      desc: "Tips collected per day, payment mode, and order channel",
      render: () => {
        const tipped = orders.filter((o) => o.tip > 0);
        if (tipped.length === 0) {
          return <div className="p-6 text-sm text-muted-foreground text-center">No tips recorded in this range.</div>;
        }
        const total = tipped.reduce((s, o) => s + o.tip, 0);
        const byDay = new Map<string, { tip: number; count: number }>();
        const byPM = new Map<string, { tip: number; count: number }>();
        for (const o of tipped) {
          const d = new Date(o.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
          const dc = byDay.get(d) ?? { tip: 0, count: 0 };
          dc.tip += o.tip;
          dc.count += 1;
          byDay.set(d, dc);

          const m = o.paymentMode ?? "—";
          const mc = byPM.get(m) ?? { tip: 0, count: 0 };
          mc.tip += o.tip;
          mc.count += 1;
          byPM.set(m, mc);
        }
        return (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 border-b">
              <Kpi label="Tips collected" value={inr(total)} tone="good" />
              <Kpi label="Tipped orders" value={`${tipped.length} / ${orders.length}`} />
              <Kpi label="Avg tip" value={inr(total / tipped.length)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:divide-x">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground p-3">By day</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Tips</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...byDay.entries()].map(([d, v]) => (
                      <TableRow key={d}>
                        <TableCell>{d}</TableCell>
                        <TableCell className="text-right">{v.count}</TableCell>
                        <TableCell className="text-right font-medium">{inr(v.tip)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground p-3">By payment mode</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mode</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Tips</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...byPM.entries()].map(([m, v]) => (
                      <TableRow key={m}>
                        <TableCell>{m}</TableCell>
                        <TableCell className="text-right">{v.count}</TableCell>
                        <TableCell className="text-right font-medium">{inr(v.tip)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        );
      },
    },
    "tax-report": {
      title: "GST output",
      desc: "Tax collected by rate slab",
      render: () => {
        const map = new Map<number, { taxable: number; tax: number }>();
        for (const o of orders) {
          for (const li of o.items) {
            const cur = map.get(li.taxRate) ?? { taxable: 0, tax: 0 };
            cur.taxable += li.qty * li.price;
            cur.tax += li.qty * li.price * (li.taxRate / 100);
            map.set(li.taxRate, cur);
          }
        }
        return (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>GST rate</TableHead>
                <TableHead className="text-right">Taxable value</TableHead>
                <TableHead className="text-right">CGST</TableHead>
                <TableHead className="text-right">SGST</TableHead>
                <TableHead className="text-right">Total tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...map.entries()].sort((a, b) => a[0] - b[0]).map(([rate, v]) => (
                <TableRow key={rate}>
                  <TableCell className="font-medium">{rate}%</TableCell>
                  <TableCell className="text-right">{inr(v.taxable)}</TableCell>
                  <TableCell className="text-right">{inr(v.tax / 2)}</TableCell>
                  <TableCell className="text-right">{inr(v.tax / 2)}</TableCell>
                  <TableCell className="text-right font-medium">{inr(v.tax)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        );
      },
    },

    // ─── New top-12 reports (Bill Settlement, HSN, Online Order, Tax Item-Wise) ───
    "bill-settlement": {
      title: "Bill Settlement Report",
      desc: "Per-bill detail · tender · timestamps",
      render: () => (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bill No</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Discount</TableHead>
              <TableHead className="text-right">Tax</TableHead>
              <TableHead className="text-right">Grand</TableHead>
              <TableHead>Tender</TableHead>
              <TableHead>Settled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => {
              const gross = o.subTotal;
              return (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.invoiceNo}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {o.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  </TableCell>
                  <TableCell className="text-xs">{o.orderType.replace("_", " ")}</TableCell>
                  <TableCell className="text-xs">{o.customer?.name ?? "—"}</TableCell>
                  <TableCell className="text-right">{inr(gross)}</TableCell>
                  <TableCell className="text-right text-emerald-700">−{inr(o.discount)}</TableCell>
                  <TableCell className="text-right">{inr(o.taxTotal)}</TableCell>
                  <TableCell className="text-right font-semibold">{inr(o.grandTotal)}</TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="text-[10px]">{o.paymentMode ?? "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {o.closedAt ? o.closedAt.toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ),
    },

    "tax-item-wise": {
      title: "Tax Report: Item Wise",
      desc: "Per-item CGST/SGST split — GSTR-ready",
      render: () => {
        const map = new Map<string, { name: string; hsn: string; qty: number; taxable: number; rate: number }>();
        for (const o of orders) {
          for (const li of o.items) {
            const key = `${li.itemId}|${li.taxRate}`;
            const cur = map.get(key) ?? { name: li.name, hsn: "—", qty: 0, taxable: 0, rate: li.taxRate };
            cur.qty += li.qty;
            cur.taxable += li.qty * li.price;
            map.set(key, cur);
          }
        }
        const rows = [...map.values()].sort((a, b) => b.taxable - a.taxable);
        const totals = rows.reduce((s, r) => ({ qty: s.qty + r.qty, taxable: s.taxable + r.taxable, tax: s.tax + (r.taxable * r.rate) / 100 }), { qty: 0, taxable: 0, tax: 0 });
        return (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>HSN</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Taxable</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">CGST</TableHead>
                <TableHead className="text-right">SGST</TableHead>
                <TableHead className="text-right">Total tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const tax = (r.taxable * r.rate) / 100;
                return (
                  <TableRow key={r.name + r.rate}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.hsn}</TableCell>
                    <TableCell className="text-right">{r.qty}</TableCell>
                    <TableCell className="text-right">{inr(r.taxable)}</TableCell>
                    <TableCell className="text-right">{r.rate}%</TableCell>
                    <TableCell className="text-right">{inr(tax / 2)}</TableCell>
                    <TableCell className="text-right">{inr(tax / 2)}</TableCell>
                    <TableCell className="text-right font-medium">{inr(tax)}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="font-semibold bg-muted/30">
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell className="text-right">{totals.qty}</TableCell>
                <TableCell className="text-right">{inr(totals.taxable)}</TableCell>
                <TableCell />
                <TableCell className="text-right">{inr(totals.tax / 2)}</TableCell>
                <TableCell className="text-right">{inr(totals.tax / 2)}</TableCell>
                <TableCell className="text-right">{inr(totals.tax)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        );
      },
    },

    "hsn": {
      title: "HSN Report",
      desc: "HSN-wise tax bifurcation — GSTR-1 ready",
      render: () => {
        // Group taxable + tax by (HSN, rate). Items without HSN bucket under '—'.
        const map = new Map<string, { hsn: string; rate: number; qty: number; taxable: number }>();
        for (const o of orders) {
          for (const li of o.items) {
            const hsn = "—"; // OrderItem doesn't capture HSN yet — placeholder column.
            const key = `${hsn}|${li.taxRate}`;
            const cur = map.get(key) ?? { hsn, rate: li.taxRate, qty: 0, taxable: 0 };
            cur.qty += li.qty;
            cur.taxable += li.qty * li.price;
            map.set(key, cur);
          }
        }
        return (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>HSN</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Taxable</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">CGST</TableHead>
                <TableHead className="text-right">SGST</TableHead>
                <TableHead className="text-right">Total tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...map.values()].map((r) => {
                const tax = (r.taxable * r.rate) / 100;
                return (
                  <TableRow key={r.hsn + r.rate}>
                    <TableCell className="font-mono">{r.hsn}</TableCell>
                    <TableCell className="text-right">{r.qty}</TableCell>
                    <TableCell className="text-right">{inr(r.taxable)}</TableCell>
                    <TableCell className="text-right">{r.rate}%</TableCell>
                    <TableCell className="text-right">{inr(tax / 2)}</TableCell>
                    <TableCell className="text-right">{inr(tax / 2)}</TableCell>
                    <TableCell className="text-right font-medium">{inr(tax)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        );
      },
    },

    "online-order": {
      title: "Online Order Report",
      desc: "Aggregator orders with commission and timeline",
      render: () => {
        const online = orders.filter((o) => o.channel !== "POS");
        if (online.length === 0) {
          return <div className="p-12 text-center text-sm text-muted-foreground">No online orders in this range.</div>;
        }
        return (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order No</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {online.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.aggregatorOrderId ?? o.invoiceNo}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{o.channel}</Badge></TableCell>
                  <TableCell className="text-xs">{o.orderType.replace("_", " ")}</TableCell>
                  <TableCell className="text-xs">{o.customer?.name ?? "—"}</TableCell>
                  <TableCell className="text-right">{o.items.length}</TableCell>
                  <TableCell className="text-right">{inr(o.subTotal)}</TableCell>
                  <TableCell className="text-right font-medium">{inr(o.grandTotal)}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{o.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {o.createdAt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        );
      },
    },
  };

  const report = REPORTS[slug];
  const registryEntry = findReport(slug);
  // If slug is in the registry but not yet implemented, render the "coming soon" stub.
  if (!report && !registryEntry) return notFound();

  const title = report?.title ?? registryEntry?.name ?? slug;
  const desc = report?.desc ?? registryEntry?.desc ?? "";

  return (
    <div>
      <PageHeader
        title={title}
        description={`${desc} · ${label}`}
        actions={
          <>
            <RangePicker current={range} />
            <Link href={`/reports/notifications/new?slug=${encodeURIComponent(slug)}`}>
              <Button variant="outline" size="sm">
                <Bell className="h-4 w-4" />
                Schedule
              </Button>
            </Link>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/reports">All reports</Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="p-0">
          {!report ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <Star className="h-8 w-8 mx-auto mb-2 text-amber-400" />
              <div className="font-medium text-foreground">Coming soon</div>
              <div className="mt-1">
                This report is on the catalog but isn't wired yet. The engine will pick it up
                when the definition lands — no UI changes needed.
              </div>
            </div>
          ) : orders.length === 0 && cancelledOrders.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No data in this range.</div>
          ) : (
            report.render()
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "bad" | "neutral" }) {
  const colors: Record<string, string> = {
    good: "text-emerald-700",
    bad: "text-rose-700",
    neutral: "",
  };
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-0.5 ${colors[tone]}`}>{value}</div>
    </div>
  );
}
