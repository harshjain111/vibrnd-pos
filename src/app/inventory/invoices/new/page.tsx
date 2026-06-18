import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { ArrowLeft, FileText } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { NewStockPurchaseForm } from "./client";
import { GrnSelectForm } from "./grn-select-client";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const outlet = await getActiveOutlet();

  /* ── PO-first path (deep-link from /inventory/purchase/[id]) ─────────── */
  if (sp.po) {
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
              <ArrowLeft className="h-4 w-4" /> Back to invoice
            </Link>
          </Button>
        </div>
      );
    }
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
          title="New invoice — against PO"
          description={`${po.poNo} · ${po.supplier.name}`}
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/inventory/invoices/new">
                <ArrowLeft className="h-4 w-4" />
                Switch to GRN-select flow
              </Link>
            </Button>
          }
        />
        <Card className="mb-3 border-sky-300 bg-sky-50/40">
          <CardContent className="p-3 flex items-start gap-2">
            <FileText className="h-4 w-4 text-sky-700 mt-0.5 shrink-0" />
            <div className="flex-1 text-sm">
              <div className="font-semibold text-sky-900">{po.poNo} · {po.supplier.name}</div>
              <div className="text-sky-800 mt-0.5">
                {catalog.length} item{catalog.length === 1 ? "" : "s"} on the PO. Quantities are
                capped to what&apos;s left to bill.
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

  /* ── Default: GRN-select flow per spec section 5 ─────────────────────── */
  // Load every supplier with at least one CLOSED GRN that hasn't been
  // covered by an invoice yet — these are the "pending GRNs" the spec
  // wants in the picker. Each GRN brings its landedTotal (the expected
  // amount we'd verify against the vendor's bill) and its line items
  // (which auto-populate the invoice's lines on selection).
  const pendingGrns = await db.grn.findMany({
    where: {
      outletId: outlet.id,
      status: "CLOSED",
      // Only GRNs with a PO have a known supplier; ad-hoc GRNs are
      // billed via the legacy add-lines path on the PO-first flow.
      poId: { not: null },
      // Exclude GRNs that are already linked to any invoice — once
      // they've been billed they shouldn't appear here.
      vendorInvoiceLinks: { none: {} },
    },
    include: {
      po: { include: { supplier: { select: { id: true, name: true } } } },
      lines: {
        include: {
          rawMaterial: { select: { name: true, unit: true, taxPct: true } },
        },
      },
    },
    orderBy: { receivedAt: "desc" },
    take: 200,
  });

  // Group by supplier — the supplier dropdown only shows vendors with
  // pending GRNs. Empty list → empty-state CTA pointing back to GRN.
  const bySupplier = new Map<
    string,
    {
      supplierName: string;
      grns: {
        id: string;
        grnNo: string;
        receivedAt: Date;
        landedTotal: number;
        poNo: string;
        lines: {
          rawMaterialId: string;
          name: string;
          unit: string;
          qty: number;
          unitPrice: number;
          taxPct: number;
          taxRate: number;
          lineDiscount: number;
        }[];
      }[];
    }
  >();
  for (const g of pendingGrns) {
    const supplierId = g.po?.supplier.id;
    if (!supplierId) continue;
    const entry = bySupplier.get(supplierId) ?? {
      supplierName: g.po!.supplier.name,
      grns: [],
    };
    entry.grns.push({
      id: g.id,
      grnNo: g.grnNo,
      receivedAt: g.receivedAt,
      landedTotal: g.landedTotal || 0,
      poNo: g.po!.poNo,
      lines: g.lines.map((l) => ({
        rawMaterialId: l.rawMaterialId,
        name: l.rawMaterial.name,
        unit: l.unit || l.rawMaterial.unit,
        qty: l.qtyReceived,
        unitPrice: l.unitCost,
        taxPct: l.rawMaterial.taxPct ?? 0,
        taxRate: l.taxRate,
        lineDiscount: l.lineDiscount,
      })),
    });
    bySupplier.set(supplierId, entry);
  }

  const supplierOptions = Array.from(bySupplier.entries())
    .map(([id, v]) => ({
      id,
      name: v.supplierName,
      grnCount: v.grns.length,
      pendingTotal: v.grns.reduce((s, g) => s + g.landedTotal, 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Flatten the GRN data into a JSON-safe payload keyed by supplier
  // for the client component.
  const grnsBySupplier: Record<string, any> = {};
  for (const [id, v] of bySupplier) {
    grnsBySupplier[id] = v.grns.map((g) => ({
      ...g,
      receivedAt: g.receivedAt.toISOString(),
    }));
  }

  return (
    <div>
      <PageHeader
        title="New invoice"
        description="Pick the supplier, select the GRNs the vendor's bill covers, then capture the invoice details."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/inventory/invoices">
              <ArrowLeft className="h-4 w-4" />
              All invoices
            </Link>
          </Button>
        }
      />
      {supplierOptions.length === 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">No pending GRNs</CardTitle>
            <CardDescription>
              Every CLOSED GRN at this outlet has already been linked to an invoice.
              Receive new stock from your suppliers and come back — or use the PO-first
              flow if the vendor billed ahead of receipt.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Empty
              title="Nothing to invoice"
              desc="Closed GRNs without a covering invoice will appear here once received."
            />
            <div className="mt-4 flex justify-center gap-2">
              <Button asChild variant="outline">
                <Link href="/inventory/grn">
                  <ArrowLeft className="h-4 w-4" /> Goods received notes
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/inventory/purchase">
                  Purchase orders
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <GrnSelectForm
          suppliers={supplierOptions}
          grnsBySupplier={grnsBySupplier}
        />
      )}
    </div>
  );
}
