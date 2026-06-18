import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { getSessionUser } from "@/lib/session";
import { inr } from "@/lib/utils";
import { RecordPaymentButton, VerifyInvoiceButton, ReviewVarianceButtons } from "./client";

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
      po: { select: { id: true, poNo: true } },
      grnLinks: { include: { grn: { select: { id: true, grnNo: true, status: true, receivedAt: true } } } },
      lines: { include: { rawMaterial: { select: { name: true } } } },
      payments: { orderBy: { occurredAt: "desc" } },
    },
  });
  if (!inv) return notFound();

  const remaining = Math.max(0, inv.grandTotal - inv.amountPaid);
  const daysOld = Math.floor((Date.now() - inv.invoiceDate.getTime()) / 86400000);
  const user = await getSessionUser();
  const role = user?.role ?? "";
  const isCC = role === "COST_CONTROLLER" || role === "OWNER" || role === "MANAGER";
  const isAccountant =
    role === "ACCOUNTANT" || role === "STORE_MANAGER" || role === "OWNER" || role === "MANAGER";

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
        {/* Left: variance review + line items + linked GRNs + payment history */}
        <div className="space-y-4">
          {/* Variance card — spec section 5. Always shown so the SM /
              Accountant / CC can see the math behind the routing. */}
          <Card
            className={
              inv.reviewStatus === "DISPUTED"
                ? "border-amber-400 bg-amber-50/40"
                : inv.reviewStatus === "REJECTED"
                ? "border-rose-400 bg-rose-50/40"
                : inv.reviewStatus === "CLEARED"
                ? "border-emerald-300 bg-emerald-50/30"
                : ""
            }
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                Variance review
                {inv.reviewStatus === "DISPUTED" && <AlertTriangle className="h-4 w-4 text-amber-700" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Expected (from GRNs)</div>
                  <div className="font-semibold tabular-nums">{inr(Math.round(inv.expectedAmount))}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Vendor billed</div>
                  <div className="font-semibold tabular-nums">{inr(Math.round(inv.invoiceAmount))}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Variance</div>
                  <div
                    className={
                      "font-semibold tabular-nums " +
                      (inv.variance > 0 ? "text-amber-700" : inv.variance < 0 ? "text-emerald-700" : "")
                    }
                  >
                    {inv.variance > 0 ? "+" : ""}
                    {inr(Math.round(inv.variance))}
                  </div>
                </div>
              </div>

              {inv.reviewStatus === "MATCHED" && isAccountant && (
                <div className="pt-2 border-t">
                  <div className="text-xs text-muted-foreground mb-2">
                    Vendor's amount matches what we expected from the GRNs. Verify to clear it for payment.
                  </div>
                  <VerifyInvoiceButton invoiceId={inv.id} />
                </div>
              )}

              {inv.reviewStatus === "DISPUTED" && (
                <div className="pt-2 border-t">
                  {isCC ? (
                    <>
                      <div className="text-xs text-muted-foreground mb-2">
                        Vendor billed more than we expected. Pick the reason:
                      </div>
                      <ReviewVarianceButtons invoiceId={inv.id} />
                    </>
                  ) : (
                    <div className="text-xs text-amber-800">
                      Awaiting Cost Controller review. They'll either approve the variance
                      (price increase valid) or send it back to the vendor for a re-invoice.
                    </div>
                  )}
                </div>
              )}

              {inv.reviewStatus === "REJECTED" && (
                <div className="pt-2 border-t">
                  <div className="text-xs text-rose-800">
                    Rejected by CC — vendor mistake. Ask the supplier to re-issue the invoice with the
                    corrected amount, then raise a fresh invoice here.
                  </div>
                  {inv.varianceNotes && (
                    <div className="text-[11px] text-rose-700 italic mt-1">CC note: {inv.varianceNotes}</div>
                  )}
                </div>
              )}

              {inv.reviewStatus === "CLEARED" && (
                <div className="pt-2 border-t text-xs text-emerald-800 inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Cleared for payment
                  {inv.varianceReason === "PRICE_INCREASE_VALID" && " (CC approved price increase)"}
                  {inv.varianceNotes && (
                    <span className="text-emerald-700/80">— {inv.varianceNotes}</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

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

          {inv.po && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Against purchase order</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <Link
                  href={`/inventory/purchase/${inv.po.id}`}
                  className="font-mono text-sm hover:underline text-primary"
                >
                  {inv.po.poNo}
                </Link>
              </CardContent>
            </Card>
          )}

          {inv.grnLinks.length > 0 && (
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
          )}

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
            <Row
              label="Review"
              value={
                <Badge
                  variant={
                    inv.reviewStatus === "CLEARED"
                      ? "success"
                      : inv.reviewStatus === "MATCHED"
                      ? "info"
                      : inv.reviewStatus === "DISPUTED"
                      ? "warning"
                      : inv.reviewStatus === "REJECTED"
                      ? "destructive"
                      : "secondary"
                  }
                  className="text-[10px]"
                >
                  {inv.reviewStatus}
                </Badge>
              }
            />
            <Row
              label="Payment"
              value={
                <Badge
                  variant={inv.status === "PAID" ? "success" : inv.status === "PARTIAL" ? "warning" : "secondary"}
                  className="text-[10px]"
                >
                  {inv.status}
                </Badge>
              }
            />
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
