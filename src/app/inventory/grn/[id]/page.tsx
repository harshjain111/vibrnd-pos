import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, AlertTriangle, FileText } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr, inr2 } from "@/lib/utils";
import { closeGrn } from "../actions";
import { CreateInvoiceLink } from "./client";

export const dynamic = "force-dynamic";

export default async function GrnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const outlet = await getActiveOutlet();
  const grn = await db.grn.findFirst({
    where: { id, outletId: outlet.id },
    include: {
      po: { include: { supplier: true } },
      department: true,
      lines: { include: { rawMaterial: true } },
      vendorInvoiceLinks: { include: { invoice: { select: { id: true, invoiceNo: true, status: true } } } },
    },
  });
  if (!grn) return notFound();

  const value = grn.lines.reduce((s, l) => s + l.qtyReceived * l.unitCost, 0);
  const damaged = grn.lines.reduce((s, l) => s + l.qtyDamaged * l.unitCost, 0);
  const linkedInvoices = grn.vendorInvoiceLinks.length;

  return (
    <div>
      <PageHeader
        title={grn.grnNo}
        description={`Received ${grn.receivedAt.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/inventory/grn">
              <ArrowLeft className="h-4 w-4" /> All GRNs
            </Link>
          </Button>
        }
      />

      {grn.isAdHoc && (
        <Card className="mb-3 border-amber-300 bg-amber-50/50">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-amber-900 text-sm">Ad-hoc receipt — no PO linked</div>
              <div className="text-sm text-amber-800 mt-0.5">
                Stock came in outside the normal procurement flow. The manager has been notified.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Received items ({grn.lines.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Damaged</TableHead>
                  <TableHead className="text-right">Short</TableHead>
                  <TableHead className="text-right">Unit cost</TableHead>
                  <TableHead className="text-right">Line value</TableHead>
                  <TableHead>Batch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grn.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.rawMaterial.name}</TableCell>
                    <TableCell className="text-right text-emerald-700 font-semibold">
                      {l.qtyReceived} {l.unit}
                    </TableCell>
                    <TableCell className="text-right">
                      {l.qtyDamaged > 0 ? (
                        <span className="text-rose-700 font-medium">
                          {l.qtyDamaged} {l.unit}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {l.qtyShort > 0 ? (
                        <span className="text-amber-700">
                          {l.qtyShort} {l.unit}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {inr2(l.unitCost)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {inr2(l.qtyReceived * l.unitCost)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {l.batchNo ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-2 text-sm">
            <Row label="Status" value={
              <Badge variant={grn.status === "CLOSED" ? "success" : "warning"} className="text-[10px]">
                {grn.status}
              </Badge>
            } />
            <Row
              label="Source"
              value={
                grn.po ? (
                  <Link href={`/inventory/purchase/${grn.poId}`} className="font-mono text-xs hover:underline">
                    {grn.po.poNo}
                  </Link>
                ) : (
                  <Badge variant="warning" className="text-[10px]">Ad-hoc</Badge>
                )
              }
            />
            {grn.po?.supplier && <Row label="Supplier" value={grn.po.supplier.name} />}
            <Row label="Department" value={grn.department.name} />
            <Row label="Lines" value={String(grn.lines.length)} />
            {grn.vendorInvoiceNo && (
              <Row label="Vendor invoice" value={grn.vendorInvoiceNo} />
            )}
            {grn.vendorInvoiceDate && (
              <Row
                label="Invoice date"
                value={new Date(grn.vendorInvoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              />
            )}
            <div className="flex items-center justify-between text-base font-semibold pt-2 border-t">
              <span>Sub-total</span>
              <span>{inr(Math.round(grn.landedSubTotal || value))}</span>
            </div>
            {grn.freightCharges > 0 && (
              <Row label="Freight" value={inr(Math.round(grn.freightCharges))} />
            )}
            {grn.deliveryCharges > 0 && (
              <Row label="Delivery" value={inr(Math.round(grn.deliveryCharges))} />
            )}
            {grn.otherCharges > 0 && (
              <Row label="Other charges" value={inr(Math.round(grn.otherCharges))} />
            )}
            {grn.taxAmount > 0 && (
              <Row label="Tax" value={inr(Math.round(grn.taxAmount))} />
            )}
            {grn.discountAmount > 0 && (
              <Row label="Discount" value={<span className="text-emerald-700">−{inr(Math.round(grn.discountAmount))}</span>} />
            )}
            <div className="flex items-center justify-between text-base font-semibold pt-2 border-t">
              <span>Landed total</span>
              <span>{inr(Math.round(grn.landedTotal || value))}</span>
            </div>
            {damaged > 0 && (
              <div className="flex items-center justify-between text-sm text-rose-700">
                <span>Damaged value</span>
                <span>{inr(Math.round(damaged))}</span>
              </div>
            )}
            {grn.notes && <p className="text-xs text-muted-foreground pt-2 border-t">{grn.notes}</p>}

            {grn.status === "OPEN" && (
              <form action={closeGrn} className="pt-2 border-t">
                <input type="hidden" name="id" value={grn.id} />
                <Button type="submit" variant="outline" size="sm" className="w-full">
                  Close this GRN
                </Button>
              </form>
            )}

            <div className="pt-2 border-t space-y-1.5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Stock Purchase
              </div>
              {linkedInvoices > 0 ? (
                <ul className="space-y-1">
                  {grn.vendorInvoiceLinks.map((vi) => (
                    <li key={vi.invoiceId} className="text-xs flex items-center justify-between">
                      <Link href={`/inventory/invoices/${vi.invoiceId}`} className="font-mono hover:underline">
                        {vi.invoice.invoiceNo}
                      </Link>
                      <Badge
                        variant={
                          vi.invoice.status === "PAID"
                            ? "success"
                            : vi.invoice.status === "PARTIAL"
                              ? "warning"
                              : "secondary"
                        }
                        className="text-[9px]"
                      >
                        {vi.invoice.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <CreateInvoiceLink grnId={grn.id} />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
