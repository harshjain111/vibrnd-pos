import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/utils";
import { ArrowLeft, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * HQ deep-drill — level 2: Outlet → Day (audit TASK 24).
 * Lists each calendar day in the last 30 days with bills + sales totals.
 */
export default async function HqOutletPage({ params }: { params: Promise<{ outletId: string }> }) {
  await requireUser("OWNER");
  const { outletId } = await params;
  const outlet = await db.outlet.findUnique({ where: { id: outletId } });
  if (!outlet) return notFound();

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 30);

  const orders = await db.order.findMany({
    where: { outletId, status: { in: ["PAID", "PRINTED"] }, createdAt: { gte: start } },
    select: { createdAt: true, grandTotal: true },
  });

  const byDay = new Map<string, { bills: number; gross: number }>();
  for (const o of orders) {
    const d = o.createdAt.toISOString().slice(0, 10);
    const cur = byDay.get(d) ?? { bills: 0, gross: 0 };
    cur.bills += 1;
    cur.gross += o.grandTotal;
    byDay.set(d, cur);
  }
  const rows = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const total = rows.reduce((s, [, v]) => s + v.gross, 0);
  const totalBills = rows.reduce((s, [, v]) => s + v.bills, 0);

  return (
    <div>
      <PageHeader
        title={outlet.name}
        description={`${rows.length} days · ${totalBills} bills · ${inr(total)} in last 30 days`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/hq">
              <ArrowLeft className="h-4 w-4" />
              Back to HQ
            </Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Bills</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">AOV</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(([d, v]) => (
                <TableRow key={d}>
                  <TableCell className="font-medium">
                    {new Date(d).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "2-digit" })}
                  </TableCell>
                  <TableCell className="text-right">{v.bills}</TableCell>
                  <TableCell className="text-right font-semibold">{inr(v.gross)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{inr(v.bills ? v.gross / v.bills : 0)}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/hq/${outletId}/${d}`} className="text-primary hover:underline inline-flex items-center">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    No sales in the last 30 days.
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
