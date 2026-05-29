import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  APPROVED: "success",
  PENDING_MANAGER: "warning",
  PENDING_AUDITOR: "warning",
  REJECTED: "destructive",
  CANCELLED: "secondary",
};

export default async function StockPurchaseListPage() {
  const outlet = await getActiveOutlet();
  const purchases = await db.purchase.findMany({
    where: { outletId: outlet.id },
    include: { supplier: true, lines: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const totalsThisMonth = purchases
    .filter((p) => p.createdAt.getMonth() === new Date().getMonth())
    .reduce((s, p) => s + p.grandTotal, 0);
  const unpaid = purchases.filter((p) => p.paymentType !== "PAID").reduce((s, p) => s + (p.grandTotal - p.amountPaid), 0);

  return (
    <div>
      <PageHeader
        title="Stock Purchase"
        description="Vendor purchases received into the outlet. Update Inventory Stock = ON auto-increments raw materials."
        actions={
          <Link href="/inventory/purchase-records/new">
            <Button size="sm"><Plus className="h-4 w-4" />New purchase</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-3 gap-3 mb-3">
        <Card><CardContent className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">This month</div>
          <div className="font-semibold text-lg">{inr(totalsThisMonth)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Unpaid balance</div>
          <div className="font-semibold text-lg text-amber-700">{inr(unpaid)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Records</div>
          <div className="font-semibold text-lg">{purchases.length}</div>
        </CardContent></Card>
      </div>

      {purchases.length === 0 ? (
        <Card><CardContent><Empty title="No purchases yet" desc="Tap New purchase to record a vendor invoice." /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.invoiceDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                    </TableCell>
                    <TableCell className="font-medium">{p.supplier?.name ?? "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{p.invoiceNo ?? p.id.slice(0, 8)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{p.lines.length}</TableCell>
                    <TableCell className="text-right font-semibold">{inr(p.grandTotal)}</TableCell>
                    <TableCell>
                      <Badge variant={p.paymentType === "PAID" ? "success" : p.paymentType === "PARTIAL" ? "warning" : "secondary"} className="text-[10px]">
                        {p.paymentType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[p.status] ?? "secondary"} className="text-[10px]">
                        {p.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
