import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClickableRow } from "@/components/ui/clickable-row";
import { PageHeader } from "@/components/shell/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Empty } from "@/components/ui/empty";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { Plus, RefreshCw } from "lucide-react";
import { FloorPlan } from "./floor-plan";

export const dynamic = "force-dynamic";

export default async function LiveOrdersPage() {
  const outlet = await getActiveOutlet();
  const running = await db.order.findMany({
    where: { outletId: outlet.id, status: { in: ["RUNNING", "SAVED", "PRINTED"] } },
    include: { items: true, table: true, customer: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const sum = (arr: typeof running, t: string) => arr.filter((o) => o.orderType === t).reduce((s, o) => s + o.grandTotal, 0);
  const cnt = (arr: typeof running, t: string) => arr.filter((o) => o.orderType === t).length;

  return (
    <div>
      <PageHeader
        title="Live orders"
        description="Active orders awaiting fulfilment"
        actions={
          <>
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button size="sm" asChild>
              <Link href="/billing">
                <Plus className="h-4 w-4" />
                New Bill
              </Link>
            </Button>
          </>
        }
      />

      <Tabs defaultValue="running">
        <TabsList>
          <TabsTrigger value="running">Running orders ({running.length})</TabsTrigger>
          <TabsTrigger value="tables">Running tables</TabsTrigger>
        </TabsList>

        <TabsContent value="running" className="space-y-4">
          {/* Summary strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <SumCard label="Dine in" count={cnt(running, "DINE_IN")} total={sum(running, "DINE_IN")} />
            <SumCard label="Pickup" count={cnt(running, "PICKUP")} total={sum(running, "PICKUP")} />
            <SumCard label="Delivery" count={cnt(running, "DELIVERY")} total={sum(running, "DELIVERY")} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Open orders</CardTitle>
              <CardDescription>Orders not yet settled</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {running.length === 0 ? (
                <Empty title="No live orders" desc="Start a new bill from the POS to see it here." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Table / Customer</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {running.map((o) => (
                      <ClickableRow key={o.id} href={`/billing?resume=${o.id}`}>
                        <TableCell className="font-mono text-xs">{o.invoiceNo}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{o.orderType.replace("_", " ")}</Badge>
                        </TableCell>
                        <TableCell>{o.table?.name ?? o.customer?.name ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{o.items.length}</TableCell>
                        <TableCell>
                          <StatusBadge status={o.status} />
                        </TableCell>
                        <TableCell className="text-right font-semibold">{inr(o.grandTotal)}</TableCell>
                      </ClickableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tables">
          <FloorPlan outletId={outlet.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SumCard({ label, count, total }: { label: string; count: number; total: number }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold mt-1">{inr(total)}</div>
        </div>
        <Badge variant="outline">{count}</Badge>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
    RUNNING: "warning",
    SAVED: "secondary",
    PRINTED: "info" as any,
    PAID: "success",
    CANCELLED: "destructive",
  };
  return <Badge variant={map[status] ?? "secondary"}>{status}</Badge>;
}
