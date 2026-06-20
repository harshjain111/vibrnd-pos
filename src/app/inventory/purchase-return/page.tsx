import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Undo2 } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { inr, fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PurchaseReturnListPage() {
  await requireUser();
  const outlet = await getActiveOutlet();

  const returns = await db.purchaseReturn.findMany({
    where: { outletId: outlet.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const supplierIds = Array.from(new Set(returns.map((r) => r.supplierId).filter(Boolean) as string[]));
  const suppliers = supplierIds.length
    ? await db.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true } })
    : [];
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  return (
    <div>
      <PageHeader
        title="Purchase Return"
        description="Debit notes for goods returned to suppliers — reduces stock and what you owe the vendor."
        actions={
          <Button asChild size="sm">
            <Link href="/inventory/purchase-return/new">
              <Plus className="h-4 w-4" />
              New purchase return
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {returns.length === 0 ? (
            <Empty
              icon={Undo2}
              title="No purchase returns yet"
              desc="Raise one against a purchase order or a stock purchase when goods go back to a supplier."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Debit note</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Against</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.map((r) => {
                  let sourceNo = "—";
                  try {
                    sourceNo = r.linesJson ? (JSON.parse(r.linesJson).sourceNo ?? "—") : "—";
                  } catch {
                    /* ignore malformed */
                  }
                  return (
                    <TableRow key={r.id} className="hover:bg-accent/40">
                      <TableCell>
                        <Link
                          href={`/inventory/purchase-return/${r.id}`}
                          className="font-mono text-xs hover:underline"
                        >
                          {r.debitNoteNo ?? r.id.slice(0, 8)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(r.debitNoteDate)}</TableCell>
                      <TableCell className="text-sm">
                        {r.supplierId ? supplierName.get(r.supplierId) ?? "—" : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{sourceNo}</TableCell>
                      <TableCell className="text-right font-medium">{inr(Math.round(r.grandTotal))}</TableCell>
                      <TableCell>
                        <StatusBadge kind="return" status={r.status} className="text-[10px]" />
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
