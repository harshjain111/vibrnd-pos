import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { Plus, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "secondary" | "info" | "success" | "destructive"> = {
  DRAFT: "secondary",
  SENT: "info",
  RECEIVED: "success",
  CANCELLED: "destructive",
};

export default async function POListPage() {
  const outlet = await getActiveOutlet();
  const pos = await db.purchaseOrder.findMany({
    where: { outletId: outlet.id },
    include: { supplier: true, lines: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const draftValue = pos.filter((p) => p.status === "DRAFT").reduce((s, p) => s + p.grandTotal, 0);
  const receivedValue = pos.filter((p) => p.status === "RECEIVED").reduce((s, p) => s + p.grandTotal, 0);

  return (
    <div>
      <PageHeader
        title="Purchase orders"
        description={`${pos.length} POs · ${inr(receivedValue)} received · ${inr(draftValue)} in draft`}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/inventory">
                <ArrowLeft className="h-4 w-4" />
                Inventory
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/inventory/purchase/new">
                <Plus className="h-4 w-4" />
                New PO
              </Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO No.</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-12">
                    No purchase orders yet. Create one to procure raw materials from a supplier.
                  </TableCell>
                </TableRow>
              ) : (
                pos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.poNo}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(p.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </TableCell>
                    <TableCell>{p.supplier.name}</TableCell>
                    <TableCell className="text-right">{p.lines.length}</TableCell>
                    <TableCell className="text-right font-medium">{inr(p.grandTotal)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_TONE[p.status] ?? "secondary"}>{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/inventory/purchase/${p.id}`}>Open</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
