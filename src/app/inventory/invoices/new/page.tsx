import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { inr } from "@/lib/utils";
import { NewStockPurchaseForm } from "./client";

export const dynamic = "force-dynamic";

// POs that can be billed — anything that's been placed with the supplier.
const BILLABLE_PO_STATUSES = ["APPROVED", "SENT", "PARTIALLY_RECEIVED", "CLOSED"];

export default async function NewStockPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const outlet = await getActiveOutlet();

  /* ── Step 1: no PO picked → show PO picker ───────────────────────────── */
  if (!sp.po) {
    const pos = await db.purchaseOrder.findMany({
      where: { outletId: outlet.id, status: { in: BILLABLE_PO_STATUSES } },
      include: {
        supplier: { select: { name: true } },
        lines: { select: { qty: true, lineTotal: true } },
        stockPurchases: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return (
      <div>
        <PageHeader
          title="New stock purchase"
          description="Select the purchase order this supplier bill is against — items load automatically from the PO."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/inventory/invoices">
                <ArrowLeft className="h-4 w-4" />
                All stock purchases
              </Link>
            </Button>
          }
        />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Step 1 — Select a purchase order</CardTitle>
            <CardDescription>
              Pick the PO the supplier has billed against. The next step pulls in its items and
              quantities — adjust rates/qty to match the printed bill and save. Stock isn&apos;t
              affected here; it moves when you record the GRN.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {pos.length === 0 ? (
              <Empty
                title="No purchase orders to bill"
                desc="Raise and send a PO first from /inventory/purchase."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">PO value</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                    <TableHead className="text-right w-28"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pos.map((po) => (
                    <TableRow key={po.id} className="hover:bg-accent/40">
                      <TableCell>
                        <Link
                          href={`/inventory/invoices/new?po=${po.id}`}
                          className="font-mono text-xs hover:underline"
                        >
                          {po.poNo}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {po.createdAt.toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-sm">{po.supplier.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {po.status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {inr(Math.round(po.grandTotal))}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {po.stockPurchases.length > 0 ? (
                          <Badge variant="success" className="text-[9px]">
                            {po.stockPurchases.length} bill(s)
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/inventory/invoices/new?po=${po.id}`}>
                            Use this
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
    );
  }

  /* ── Step 2: PO picked → prefill the form from its lines ─────────────── */
  const po = await db.purchaseOrder.findFirst({
    where: { id: sp.po, outletId: outlet.id },
    include: {
      supplier: true,
      lines: { include: { rawMaterial: { select: { name: true, unit: true, taxPct: true } } } },
    },
  });
  if (!po) {
    return (
      <div>
        <PageHeader title="PO not found" description="That purchase order doesn't exist at this outlet." />
        <Button asChild variant="outline">
          <Link href="/inventory/invoices/new">
            <ArrowLeft className="h-4 w-4" /> Pick another PO
          </Link>
        </Button>
      </div>
    );
  }

  // Already billed per RM against this PO, so we prefill "remaining".
  const priorInvoices = await db.vendorInvoice.findMany({
    where: { outletId: outlet.id, poId: po.id },
    select: { lines: { select: { rawMaterialId: true, qty: true } } },
  });
  const billedByRm = new Map<string, number>();
  for (const inv of priorInvoices) {
    for (const l of inv.lines) {
      billedByRm.set(l.rawMaterialId, (billedByRm.get(l.rawMaterialId) ?? 0) + l.qty);
    }
  }

  // Aggregate PO lines per raw material (a PO can list an item on >1 line).
  const agg = new Map<
    string,
    { name: string; unit: string; taxPct: number; ordered: number; unitPrice: number }
  >();
  for (const l of po.lines) {
    const ex = agg.get(l.rawMaterialId);
    if (ex) {
      ex.ordered += l.qty;
      ex.unitPrice = l.unitPrice || ex.unitPrice;
    } else {
      agg.set(l.rawMaterialId, {
        name: l.rawMaterial.name,
        unit: l.unit || l.rawMaterial.unit,
        taxPct: l.rawMaterial.taxPct ?? 0,
        ordered: l.qty,
        unitPrice: l.unitPrice,
      });
    }
  }
  const catalog = Array.from(agg.entries())
    .map(([rawMaterialId, v]) => {
      const billed = billedByRm.get(rawMaterialId) ?? 0;
      return {
        rawMaterialId,
        name: v.name,
        unit: v.unit,
        taxPct: v.taxPct,
        ordered: v.ordered,
        billed,
        remaining: Math.max(0, Number((v.ordered - billed).toFixed(4))),
        unitPrice: v.unitPrice,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <PageHeader
        title="Record stock purchase"
        description={`Against ${po.poNo} · ${po.supplier.name}`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/inventory/invoices/new">
              <ArrowLeft className="h-4 w-4" />
              Change PO
            </Link>
          </Button>
        }
      />

      <Card className="mb-3 border-sky-300 bg-sky-50/40">
        <CardContent className="p-3 flex items-start gap-2">
          <FileText className="h-4 w-4 text-sky-700 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-sky-900">
              {po.poNo} · {po.supplier.name}
            </div>
            <div className="text-sky-800 mt-0.5">
              {catalog.length} item{catalog.length === 1 ? "" : "s"} on the PO. Quantities are
              capped to what&apos;s left to bill. Stock moves on GRN, not here.
            </div>
          </div>
          <Link
            href={`/inventory/purchase/${po.id}`}
            target="_blank"
            rel="noopener"
            className="text-xs text-sky-700 underline-offset-2 hover:underline shrink-0"
          >
            View PO ↗
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <NewStockPurchaseForm
            poId={po.id}
            poNo={po.poNo}
            supplierId={po.supplierId}
            supplierName={po.supplier.name}
            catalog={catalog}
          />
        </CardContent>
      </Card>
    </div>
  );
}
