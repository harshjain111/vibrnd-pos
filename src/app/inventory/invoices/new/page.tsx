import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, ArrowRight, FileText, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { inr } from "@/lib/utils";
import { NewInvoiceForm } from "./client";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ grn?: string; supplier?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const outlet = await getActiveOutlet();

  /* ── Step 1: no GRN picked → show GRN picker ──────────────── */
  if (!sp.grn) {
    const grns = await db.grn.findMany({
      where: { outletId: outlet.id },
      include: {
        po: { select: { poNo: true, supplier: { select: { id: true, name: true } } } },
        lines: true,
        vendorInvoiceLinks: { select: { invoiceId: true } },
      },
      orderBy: { receivedAt: "desc" },
      take: 100,
    });
    const eligibleGrns = grns.filter((g) => g.vendorInvoiceLinks.length === 0);

    return (
      <div>
        <PageHeader
          title="New vendor invoice"
          description="Pick the GRN this invoice covers — the next step lets you tag more GRNs and key in the actual line items from the vendor's bill."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/inventory/invoices">
                <ArrowLeft className="h-4 w-4" />
                All invoices
              </Link>
            </Button>
          }
        />

        <Card className="mb-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Step 1 — Pick a starting GRN</CardTitle>
            <CardDescription>
              The vendor's invoice is captured manually so any difference between what
              they billed and what arrived shows up here. Pick any GRN to lock in the
              supplier — on the next step you can tick more GRNs from the same supplier
              and add the line items, taxes, and totals exactly as printed.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardContent className="p-0">
            {eligibleGrns.length === 0 ? (
              <Empty
                title="No GRNs ready to invoice"
                desc={
                  grns.length === 0
                    ? "Save a GRN first from /inventory/grn."
                    : "Every GRN already has an invoice. (To split one GRN across multiple invoices, open the linked invoice and add another against that GRN.)"
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>GRN #</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>PO</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Lines</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right w-28"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eligibleGrns.map((g) => {
                    const value = g.lines.reduce(
                      (s, l) => s + l.qtyReceived * l.unitCost,
                      0
                    );
                    return (
                      <TableRow key={g.id} className="hover:bg-accent/40">
                        <TableCell>
                          <Link
                            href={`/inventory/invoices/new?grn=${g.id}`}
                            className="font-mono text-xs hover:underline"
                          >
                            {g.grnNo}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {g.receivedAt.toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>
                          {g.po ? (
                            <span className="font-mono text-xs">{g.po.poNo}</span>
                          ) : (
                            <Badge variant="warning" className="text-[10px]">
                              <AlertTriangle className="h-3 w-3 mr-0.5" />
                              Ad-hoc
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {g.po?.supplier.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm">{g.lines.length}</TableCell>
                        <TableCell className="text-right font-medium">
                          {inr(Math.round(value))}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/inventory/invoices/new?grn=${g.id}`}>
                              Use this
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
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

  /* ── Step 2: GRN picked → load supplier + PO context + show form ── */
  const seedGrn = await db.grn.findFirst({
    where: { id: sp.grn, outletId: outlet.id },
    include: {
      lines: { include: { rawMaterial: { select: { name: true, unit: true, taxPct: true } } } },
      po: { include: { supplier: true } },
    },
  });
  if (!seedGrn) {
    return (
      <div>
        <PageHeader title="GRN not found" description="The GRN doesn't exist at this outlet." />
        <Button asChild variant="outline">
          <Link href="/inventory/invoices/new">
            <ArrowLeft className="h-4 w-4" /> Pick another GRN
          </Link>
        </Button>
      </div>
    );
  }

  const supplierId = sp.supplier ?? seedGrn.po?.supplierId ?? "";

  // More GRNs the user can tick on top of the seed — same supplier, not yet
  // invoiced. Includes ad-hoc GRNs (no PO) so they can be batched in too.
  const additionalGrns = await db.grn.findMany({
    where: {
      outletId: outlet.id,
      id: { not: seedGrn.id },
      vendorInvoiceLinks: { none: {} },
      OR: [{ poId: null }, { po: supplierId ? { supplierId } : undefined }],
    },
    include: {
      lines: { include: { rawMaterial: { select: { name: true, unit: true, taxPct: true } } } },
      po: { select: { id: true, poNo: true, supplierId: true } },
    },
    orderBy: { receivedAt: "desc" },
    take: 50,
  });

  const allEligibleGrns = [seedGrn, ...additionalGrns];

  // Catalog of PO items + remaining qty (ordered − already invoiced against
  // sibling GRNs). Drives the line picker so the SM can only invoice what's
  // really left on the order.
  const linkedPoIds = Array.from(
    new Set(allEligibleGrns.map((g) => g.poId).filter(Boolean) as string[])
  );
  type CatalogRow = {
    rawMaterialId: string;
    name: string;
    unit: string;
    taxPct: number;
    ordered: number;
    alreadyInvoiced: number;
    remaining: number;
    lastUnitPrice: number;
  };
  let poItemCatalog: CatalogRow[] = [];
  if (linkedPoIds.length > 0) {
    const poLines = await db.purchaseOrderLine.findMany({
      where: { poId: { in: linkedPoIds } },
      include: {
        rawMaterial: { select: { id: true, name: true, unit: true, taxPct: true } },
      },
    });
    const aggregated = new Map<
      string,
      { name: string; unit: string; taxPct: number; ordered: number; lastUnitPrice: number }
    >();
    for (const l of poLines) {
      const ex = aggregated.get(l.rawMaterialId);
      if (ex) {
        ex.ordered += l.qty;
        ex.lastUnitPrice = l.unitPrice || ex.lastUnitPrice;
      } else {
        aggregated.set(l.rawMaterialId, {
          name: l.rawMaterial.name,
          unit: l.unit || l.rawMaterial.unit,
          taxPct: l.rawMaterial.taxPct ?? 0,
          ordered: l.qty,
          lastUnitPrice: l.unitPrice,
        });
      }
    }
    const siblingGrns = await db.grn.findMany({
      where: { poId: { in: linkedPoIds } },
      select: { id: true },
    });
    const siblingGrnIds = siblingGrns.map((g) => g.id);
    const priorInvLines = supplierId
      ? await db.vendorInvoice.findMany({
          where: {
            outletId: outlet.id,
            supplierId,
            grnLinks: { some: { grnId: { in: siblingGrnIds } } },
          },
          select: { lines: { select: { rawMaterialId: true, qty: true } } },
        })
      : [];
    const invoicedByRm = new Map<string, number>();
    for (const inv of priorInvLines) {
      for (const l of inv.lines) {
        invoicedByRm.set(l.rawMaterialId, (invoicedByRm.get(l.rawMaterialId) ?? 0) + l.qty);
      }
    }
    poItemCatalog = Array.from(aggregated.entries())
      .map(([rmId, v]) => {
        const already = invoicedByRm.get(rmId) ?? 0;
        return {
          rawMaterialId: rmId,
          name: v.name,
          unit: v.unit,
          taxPct: v.taxPct,
          ordered: v.ordered,
          alreadyInvoiced: already,
          remaining: Math.max(0, v.ordered - already),
          lastUnitPrice: v.lastUnitPrice,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const suppliers = await db.supplier.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const seedTotal = seedGrn.lines.reduce((s, l) => s + l.qtyReceived * l.unitCost, 0);

  return (
    <div>
      <PageHeader
        title="Record vendor invoice"
        description={`Against ${seedGrn.grnNo}${seedGrn.po ? ` · PO ${seedGrn.po.poNo}` : ""}`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/inventory/invoices/new">
              <ArrowLeft className="h-4 w-4" />
              Change GRN
            </Link>
          </Button>
        }
      />

      <Card className="mb-3 border-sky-300 bg-sky-50/40">
        <CardContent className="p-3 flex items-start gap-2">
          <FileText className="h-4 w-4 text-sky-700 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-sky-900 text-sm">
              {seedGrn.grnNo}
              {seedGrn.po && <> · {seedGrn.po.poNo}</>}
              {seedGrn.po && <> · {seedGrn.po.supplier.name}</>}
            </div>
            <div className="text-sm text-sky-800 mt-0.5">
              {seedGrn.lines.length} line{seedGrn.lines.length === 1 ? "" : "s"} · receipts worth{" "}
              <strong>{inr(Math.round(seedTotal))}</strong>. Add line items below from
              what the vendor billed — qty is capped to the PO budget.
            </div>
          </div>
          {seedGrn.po && (
            <Link
              href={`/inventory/grn/${seedGrn.id}`}
              target="_blank"
              rel="noopener"
              className="text-xs text-sky-700 underline-offset-2 hover:underline shrink-0"
              title="Opens in a new tab so this form keeps everything you've typed"
            >
              View GRN ↗
            </Link>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <NewInvoiceForm
            suppliers={suppliers}
            initialSupplierId={supplierId}
            initialGrnId={seedGrn.id}
            eligibleGrns={allEligibleGrns.map((g) => ({
              id: g.id,
              grnNo: g.grnNo,
              poNo: g.po?.poNo ?? null,
              supplierId: g.po?.supplierId ?? null,
              receivedAt: g.receivedAt.toISOString(),
              value: Math.round(g.lines.reduce((s, l) => s + l.qtyReceived * l.unitCost, 0)),
            }))}
            poItemCatalog={poItemCatalog}
            grnReceiptHints={seedGrn.lines.map((l) => ({
              rawMaterialId: l.rawMaterialId,
              name: l.rawMaterial.name,
              qtyReceived: l.qtyReceived,
              unit: l.unit,
              unitPrice: l.unitCost,
              taxPct: l.rawMaterial.taxPct ?? 0,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
