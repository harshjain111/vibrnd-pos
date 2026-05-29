import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * HQ deep-drill — level 3: Outlet × Day → Hour (audit TASK 24).
 * Lists each hour of the chosen day with bills + sales. Click an hour to see
 * the actual bills.
 */
export default async function HqDayPage({ params }: { params: Promise<{ outletId: string; date: string }> }) {
  await requireUser("OWNER");
  const { outletId, date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return notFound();
  const outlet = await db.outlet.findUnique({ where: { id: outletId } });
  if (!outlet) return notFound();

  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59.999`);

  const orders = await db.order.findMany({
    where: { outletId, status: { in: ["PAID", "PRINTED"] }, createdAt: { gte: start, lte: end } },
    select: { id: true, invoiceNo: true, grandTotal: true, paymentMode: true, createdAt: true, customer: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const byHour = new Map<number, { bills: number; gross: number; orderIds: string[] }>();
  for (const o of orders) {
    const h = o.createdAt.getHours();
    const cur = byHour.get(h) ?? { bills: 0, gross: 0, orderIds: [] };
    cur.bills += 1;
    cur.gross += o.grandTotal;
    cur.orderIds.push(o.id);
    byHour.set(h, cur);
  }
  const hours = [...byHour.entries()].sort((a, b) => a[0] - b[0]);
  const total = orders.reduce((s, o) => s + o.grandTotal, 0);

  const dayLabel = new Date(date).toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <div>
      <PageHeader
        title={`${outlet.name} — ${dayLabel}`}
        description={`${orders.length} bills · ${inr(total)} sales · hour-by-hour`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/hq/${outletId}`}>
              <ArrowLeft className="h-4 w-4" />
              Back to outlet
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-3">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hour</TableHead>
                  <TableHead className="text-right">Bills</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hours.map(([h, v]) => (
                  <TableRow key={h}>
                    <TableCell className="font-mono">{String(h).padStart(2, "0")}:00</TableCell>
                    <TableCell className="text-right">{v.bills}</TableCell>
                    <TableCell className="text-right font-medium">{inr(v.gross)}</TableCell>
                  </TableRow>
                ))}
                {hours.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-8">
                      No bills on this day.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {o.createdAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/orders/${o.id}`} className="hover:underline">
                        {o.invoiceNo}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">{o.customer?.name ?? "Walk-in"}</TableCell>
                    <TableCell className="text-xs">{o.paymentMode ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium">{inr(o.grandTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
