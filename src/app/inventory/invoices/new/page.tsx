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
    // Eligible GRNs = received but not fully covered by an invoice yet.
    // Group by supplier so the user sees their stack in one place.
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
          description="Pick the GRN this invoice covers — supplier, line items, and total auto-fill from the GRN."
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
            <CardTitle className="text-base">Step 1 — Link to a Goods Received Note</CardTitle>
            <CardDescription>
              Invoice → covers one or more GRNs → which receive against a PO. Picking a
              GRN here auto-fills the supplier and the line total. You can attach more
              GRNs to the same invoice in step 2 if the vendor batched their bills.
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

  /* ── Step 2: GRN picked → show the form ──────────────────── */
  const seedGrn = await db.grn.findFirst({
    where: { id: sp.grn, outletId: outlet.id },
    include: {
      lines: true,
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

  let supplierId = sp.supplier ?? seedGrn.po?.supplierId ?? "";
  const suppliers = await db.supplier.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Eligible additional GRNs to optionally attach (same supplier, not yet invoiced).
  const additionalGrns = await db.grn.findMany({
    where: {
      outletId: outlet.id,
      id: { not: seedGrn.id },
      OR: [{ poId: null }, { po: supplierId ? { supplierId } : undefined }],
      vendorInvoiceLinks: { none: {} },
    },
    include: { po: { select: { poNo: true, supplierId: true } }, lines: true },
    orderBy: { receivedAt: "desc" },
    take: 50,
  });

  const eligibleGrns = [seedGrn, ...additionalGrns];
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
              {seedGrn.lines.length} line{seedGrn.lines.length === 1 ? "" : "s"} · estimated
              value <strong>{inr(Math.round(seedTotal))}</strong>. Override the totals
              below with whatever's printed on the vendor's invoice.
            </div>
          </div>
          {seedGrn.po && (
            <Link
              href={`/inventory/grn/${seedGrn.id}`}
              className="text-xs text-sky-700 underline-offset-2 hover:underline shrink-0"
            >
              View GRN →
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
            seedTotal={Math.round(seedTotal)}
            eligibleGrns={eligibleGrns.map((g) => ({
              id: g.id,
              grnNo: g.grnNo,
              poNo: g.po?.poNo ?? null,
              supplierId: g.po?.supplierId ?? null,
              receivedAt: g.receivedAt.toISOString(),
              value: Math.round(g.lines.reduce((s, l) => s + l.qtyReceived * l.unitCost, 0)),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
