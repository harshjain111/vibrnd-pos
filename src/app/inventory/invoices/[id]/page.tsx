import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { RecordPaymentButton } from "./client";

export const dynamic = "force-dynamic";

export default async function VendorInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const outlet = await getActiveOutlet();
  const inv = await db.vendorInvoice.findFirst({
    where: { id, outletId: outlet.id },
    include: {
      supplier: true,
      grnLinks: { include: { grn: { select: { id: true, grnNo: true, status: true, receivedAt: true } } } },
      lines: { include: { rawMaterial: { select: { name: true } } } },
      payments: { orderBy: { occurredAt: "desc" } },
    },
  });
  if (!inv) return notFound();

  const remaining = Math.max(0, inv.grandTotal - inv.amountPaid);
  const daysOld = Math.floor((Date.now() - inv.invoiceDate.getTime()) / 86400000);

  return (
    <div>
      <PageHeader
        title={inv.invoiceNo}
        description={`${inv.supplier.name} · ${inv.invoiceDate.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })} · ${daysOld} days old`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/inventory/invoices">
              <ArrowLeft className="h-4 w-4" /> All invoices
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Left: line items + linked GRNs + payment history */}
        <div className="space-y-4">
          {inv.lines.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Line items ({inv.lines.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit price</TableHead>
                      <TableHead className="text-right">Tax %</TableHead>
                      <TableHead className="text-right">Line total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inv.lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">
                          {l.description ?? l.rawMaterial.name}
                          {l.description && l.description !== l.rawMaterial.name && (
                            <span className="text-[10px] text-muted-foreground ml-1">
                              ({l.rawMaterial.name})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.qty} <span className="text-[10px] text-muted-foreground">{l.unit}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{inr(l.unitPrice)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                          {l.taxRate}%
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {inr(Math.round(l.lineTotal))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">GRNs covered ({inv.grnLinks.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>GRN</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead className="text-right">Amount on invoice</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inv.grnLinks.map((vl) => (
                    <TableRow key={vl.grnId}>
                      <TableCell>
                        <Link href={`/inventory/grn/${vl.grnId}`} className="font-mono text-xs hover:underline">
                          {vl.grn.grnNo}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {vl.grn.receivedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                      </TableCell>
                      <TableCell className="text-right font-medium">{inr(Math.round(vl.amount))}</TableCell>
                      <TableCell>
                        <Badge variant={vl.grn.status === "CLOSED" ? "success" : "warning"} className="text-[10px]">
                          {vl.grn.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Payment history ({inv.payments.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {inv.payments.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  No payments recorded yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inv.payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.occurredAt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{p.mode}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{p.reference ?? "—"}</TableCell>
                        <TableCell className="text-right font-medium text-emerald-700">
                          {inr(Math.round(p.amount))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: summary + record payment */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-2 text-sm">
            <Row label="Status" value={
              <Badge
                variant={inv.status === "PAID" ? "success" : inv.status === "PARTIAL" ? "warning" : "secondary"}
                className="text-[10px]"
              >
                {inv.status}
              </Badge>
            } />
            <Row label="Supplier" value={inv.supplier.name} />
            <Row label="Sub total" value={inr(Math.round(inv.subTotal))} />
            <Row label="Tax" value={inr(Math.round(inv.taxTotal))} />
            <div className="flex items-center justify-between text-base font-semibold pt-2 border-t">
              <span>Grand total</span>
              <span>{inr(Math.round(inv.grandTotal))}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Paid</span>
              <span className="text-emerald-700 font-medium">{inr(Math.round(inv.amountPaid))}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Outstanding</span>
              <span className={`font-semibold ${remaining > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                {inr(Math.round(remaining))}
              </span>
            </div>

            {inv.fileUrl && (
              <div className="pt-2 border-t">
                <a
                  href={inv.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs underline-offset-2 hover:underline text-primary"
                >
                  View attached invoice file →
                </a>
              </div>
            )}

            {inv.notes && (
              <div className="pt-2 border-t">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Notes</div>
                <p className="text-xs">{inv.notes}</p>
              </div>
            )}

            <div className="pt-2 border-t">
              {remaining > 0 ? (
                <RecordPaymentButton invoiceId={inv.id} maxAmount={remaining} />
              ) : (
                <div className="text-center text-emerald-700 font-medium py-1 inline-flex items-center gap-1.5 w-full justify-center">
                  <CheckCircle2 className="h-4 w-4" />
                  Paid in full
                </div>
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
