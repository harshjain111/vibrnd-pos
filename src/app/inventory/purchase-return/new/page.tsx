import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, ArrowRight, FileText, ShoppingCart } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { inr } from "@/lib/utils";
import { PurchaseReturnForm, type SourceLine } from "./client";

export const dynamic = "force-dynamic";

const BILLABLE_PO_STATUSES = ["APPROVED", "SENT", "PARTIALLY_RECEIVED", "CLOSED"];

export default async function NewPurchaseReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ src?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const outlet = await getActiveOutlet();

  /* ── Step 1: choose a source (Stock Purchase or PO) ──────────────────── */
  if (!sp.src) {
    const [stockPurchases, pos] = await Promise.all([
      db.vendorInvoice.findMany({
        where: { outletId: outlet.id },
        include: { supplier: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.purchaseOrder.findMany({
        where: { outletId: outlet.id, status: { in: BILLABLE_PO_STATUSES } },
        include: { supplier: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    return (
      <div>
        <PageHeader
          title="New purchase return"
          description="Return goods to a supplier. Pick the stock purchase or PO you're returning against — its items load on the next step."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/inventory/purchase-return">
                <ArrowLeft className="h-4 w-4" />
                All returns
              </Link>
            </Button>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-1.5">
                <FileText className="h-4 w-4" /> Against a stock purchase
              </CardTitle>
              <CardDescription>Return items billed on a supplier invoice.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {stockPurchases.length === 0 ? (
                <Empty title="No stock purchases" desc="Record a stock purchase first." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockPurchases.map((s) => (
                      <TableRow key={s.id} className="hover:bg-accent/40">
                        <TableCell className="font-mono text-xs">{s.invoiceNo}</TableCell>
                        <TableCell className="text-sm">{s.supplier.name}</TableCell>
                        <TableCell className="text-right text-sm">{inr(Math.round(s.grandTotal))}</TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/inventory/purchase-return/new?src=SP:${s.id}`}>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-1.5">
                <ShoppingCart className="h-4 w-4" /> Against a purchase order
              </CardTitle>
              <CardDescription>Return items ordered on a PO.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {pos.length === 0 ? (
                <Empty title="No purchase orders" desc="Raise a PO first." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO #</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pos.map((po) => (
                      <TableRow key={po.id} className="hover:bg-accent/40">
                        <TableCell className="font-mono text-xs">{po.poNo}</TableCell>
                        <TableCell className="text-sm">{po.supplier.name}</TableCell>
                        <TableCell className="text-right text-sm">{inr(Math.round(po.grandTotal))}</TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/inventory/purchase-return/new?src=PO:${po.id}`}>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  /* ── Step 2: load the chosen source + render the return form ─────────── */
  const [kind, id] = sp.src.split(":");
  let supplierId = "";
  let supplierName = "";
  let sourceNo = "";
  let sourceType: "PO" | "STOCK_PURCHASE" = kind === "PO" ? "PO" : "STOCK_PURCHASE";
  let lines: SourceLine[] = [];

  if (kind === "PO") {
    const po = await db.purchaseOrder.findFirst({
      where: { id, outletId: outlet.id },
      include: {
        supplier: true,
        lines: { include: { rawMaterial: { select: { name: true, unit: true, taxPct: true } } } },
      },
    });
    if (po) {
      supplierId = po.supplierId;
      supplierName = po.supplier.name;
      sourceNo = po.poNo;
      lines = po.lines.map((l) => ({
        rawMaterialId: l.rawMaterialId,
        name: l.rawMaterial.name,
        unit: l.unit || l.rawMaterial.unit,
        maxQty: l.qty,
        unitPrice: l.unitPrice,
        taxRate: l.rawMaterial.taxPct ?? 0,
      }));
    }
  } else {
    const inv = await db.vendorInvoice.findFirst({
      where: { id, outletId: outlet.id },
      include: {
        supplier: true,
        lines: { include: { rawMaterial: { select: { name: true } } } },
      },
    });
    if (inv) {
      supplierId = inv.supplierId;
      supplierName = inv.supplier.name;
      sourceNo = inv.invoiceNo;
      lines = inv.lines.map((l) => ({
        rawMaterialId: l.rawMaterialId,
        name: l.description ?? l.rawMaterial.name,
        unit: l.unit,
        maxQty: l.qty,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
      }));
    }
  }

  if (!supplierId || lines.length === 0) {
    return (
      <div>
        <PageHeader title="Source not found" description="That purchase order or stock purchase has no returnable items." />
        <Button asChild variant="outline">
          <Link href="/inventory/purchase-return/new">
            <ArrowLeft className="h-4 w-4" /> Pick another source
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Record purchase return"
        description={`Against ${sourceNo} · ${supplierName}`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/inventory/purchase-return/new">
              <ArrowLeft className="h-4 w-4" />
              Change source
            </Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="p-4">
          <PurchaseReturnForm
            supplierId={supplierId}
            supplierName={supplierName}
            sourceType={sourceType}
            sourceId={id}
            sourceNo={sourceNo}
            lines={lines}
          />
        </CardContent>
      </Card>
    </div>
  );
}
