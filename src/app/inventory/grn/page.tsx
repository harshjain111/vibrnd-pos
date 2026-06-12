import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Truck, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function GrnListPage() {
  const outlet = await getActiveOutlet();
  const grns = await db.grn.findMany({
    where: { outletId: outlet.id },
    include: {
      po: { select: { poNo: true } },
      lines: true,
    },
    orderBy: { receivedAt: "desc" },
    take: 200,
  });

  // Hydrate supplier names via the linked PO
  const poIds = grns.map((g) => g.poId).filter(Boolean) as string[];
  const poSuppliers = poIds.length
    ? await db.purchaseOrder.findMany({
        where: { id: { in: poIds } },
        select: { id: true, supplier: { select: { name: true } } },
      })
    : [];
  const supplierByPoId = new Map(poSuppliers.map((p) => [p.id, p.supplier.name]));

  return (
    <div>
      <PageHeader
        title="Goods received notes"
        description="Every shipment of raw materials in. Stock moves on each GRN save."
        actions={
          <Button asChild size="sm">
            <Link href="/inventory/grn/new">
              <Plus className="h-4 w-4" />
              New GRN
            </Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="p-0">
          {grns.length === 0 ? (
            <Empty
              title="No GRNs yet"
              desc="Once a PO arrives, create a GRN to log receipt and move stock into your store."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>GRN #</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grns.map((g) => {
                  const value = g.lines.reduce((s, l) => s + l.qtyReceived * l.unitCost, 0);
                  return (
                    <TableRow key={g.id} className="hover:bg-accent/40">
                      <TableCell>
                        <Link href={`/inventory/grn/${g.id}`} className="font-mono text-xs hover:underline">
                          {g.grnNo}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {g.receivedAt.toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        {g.po ? (
                          <Link href={`/inventory/purchase/${g.poId}`} className="text-xs font-mono hover:underline">
                            {g.po.poNo}
                          </Link>
                        ) : (
                          <Badge variant="warning" className="text-[10px]">
                            <AlertTriangle className="h-3 w-3 mr-0.5" />
                            Ad-hoc
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {g.poId ? supplierByPoId.get(g.poId) ?? "—" : "—"}
                      </TableCell>
                      <TableCell className="text-right">{g.lines.length}</TableCell>
                      <TableCell className="text-right font-medium">{inr(Math.round(value))}</TableCell>
                      <TableCell>
                        <Badge variant={g.status === "CLOSED" ? "success" : "warning"} className="text-[10px]">
                          {g.status}
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
