import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { Download } from "lucide-react";
import { requireUser } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function DayEndPage() {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();

  // Group last 30 days
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);

  const orders = await db.order.findMany({
    where: {
      outletId: outlet.id,
      status: { in: ["PAID", "PRINTED"] },
      createdAt: { gte: start },
    },
    select: { createdAt: true, grandTotal: true, paymentMode: true, orderType: true },
  });

  const expenses = await db.expense.findMany({
    where: { outletId: outlet.id, createdAt: { gte: start } },
    select: { createdAt: true, amount: true },
  });

  const byDate = new Map<string, { sales: number; orders: number; cash: number; nonCash: number; expenses: number }>();
  for (const o of orders) {
    const d = new Date(o.createdAt).toISOString().slice(0, 10);
    const cur = byDate.get(d) ?? { sales: 0, orders: 0, cash: 0, nonCash: 0, expenses: 0 };
    cur.sales += o.grandTotal;
    cur.orders += 1;
    if (o.paymentMode === "CASH") cur.cash += o.grandTotal;
    else cur.nonCash += o.grandTotal;
    byDate.set(d, cur);
  }
  for (const e of expenses) {
    const d = new Date(e.createdAt).toISOString().slice(0, 10);
    const cur = byDate.get(d) ?? { sales: 0, orders: 0, cash: 0, nonCash: 0, expenses: 0 };
    cur.expenses += e.amount;
    byDate.set(d, cur);
  }

  const rows = [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div>
      <PageHeader
        title="Day End Summary"
        description={`Daily roll-up · last 30 days · ${rows.length} days with activity`}
        actions={
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4" />
            Export
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Cash collected</TableHead>
                <TableHead className="text-right">Non-cash</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Net to bank</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(([d, v]) => {
                const net = v.cash - v.expenses;
                return (
                  <TableRow key={d}>
                    <TableCell className="font-medium">
                      {new Date(d).toLocaleDateString("en-IN", {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right">{v.orders}</TableCell>
                    <TableCell className="text-right font-medium">{inr(v.sales)}</TableCell>
                    <TableCell className="text-right">{inr(v.cash)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{inr(v.nonCash)}</TableCell>
                    <TableCell className="text-right text-rose-700">{inr(v.expenses)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={net >= 0 ? "success" : "destructive"}>{inr(net)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/day-end/${d}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
