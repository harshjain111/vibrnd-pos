import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { Download, Plus, Search } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AllOrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; type?: string }> }) {
  const sp = await searchParams;
  const outlet = await getActiveOutlet();

  const where: any = { outletId: outlet.id };
  if (sp.status && sp.status !== "all") where.status = sp.status;
  if (sp.type && sp.type !== "all") where.orderType = sp.type;
  if (sp.q) where.invoiceNo = { contains: sp.q, mode: "insensitive" };

  const orders = await db.order.findMany({
    where,
    include: { customer: true, items: true, table: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const grandTotal = orders.reduce((s, o) => s + o.grandTotal, 0);

  return (
    <div>
      <PageHeader
        title="All orders"
        description={`${orders.length} orders · Grand total ${inr(grandTotal)}`}
        actions={
          <>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" />
              Export
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

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Narrow down the order list</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 md:grid-cols-4 gap-3" action="/orders" method="GET">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={sp.q ?? ""} placeholder="Invoice No." className="pl-8" />
            </div>
            <select name="status" defaultValue={sp.status ?? "all"} className="h-9 rounded-md border bg-background px-3 text-sm">
              <option value="all">All statuses</option>
              <option value="RUNNING">Running</option>
              <option value="SAVED">Saved</option>
              <option value="PRINTED">Printed</option>
              <option value="PAID">Paid</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <select name="type" defaultValue={sp.type ?? "all"} className="h-9 rounded-md border bg-background px-3 text-sm">
              <option value="all">All types</option>
              <option value="DINE_IN">Dine in</option>
              <option value="PICKUP">Pickup</option>
              <option value="DELIVERY">Delivery</option>
            </select>
            <Button type="submit">Apply</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <Empty title="No orders match" desc="Adjust the filters or start a new bill." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
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
                    <TableCell>{o.customer?.name ?? "Walk-in"}</TableCell>
                    <TableCell className="text-right">{o.items.length}</TableCell>
                    <TableCell className="text-right font-semibold">{inr(o.grandTotal)}</TableCell>
                    <TableCell className="text-muted-foreground">{o.paymentMode ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={o.status === "PAID" ? "success" : o.status === "CANCELLED" ? "destructive" : "secondary"}>
                        {o.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
