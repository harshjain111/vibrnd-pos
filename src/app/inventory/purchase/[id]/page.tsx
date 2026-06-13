import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { getSessionUser } from "@/lib/session";
import { canAccess } from "@/lib/permissions";
import { inr, inr2 } from "@/lib/utils";
import { ArrowLeft, Send, PackageCheck, Pencil, XCircle, CheckCircle2, Truck } from "lucide-react";
import { markSent, cancelPO } from "../actions";
import { PrintPoButton, SubmitForApprovalButton, CcApproveButton, CcRejectButton } from "./client";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "secondary" | "info" | "success" | "destructive" | "warning"> = {
  DRAFT: "secondary",
  PENDING_CC_APPROVAL: "warning",
  APPROVED: "info",
  REJECTED: "destructive",
  SENT: "info",
  PARTIALLY_RECEIVED: "warning",
  CLOSED: "success",
  RECEIVED: "success",
  CANCELLED: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_CC_APPROVAL: "Pending CC approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SENT: "Sent to vendor",
  PARTIALLY_RECEIVED: "Partially received",
  CLOSED: "Closed",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

export default async function PODetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const po = await db.purchaseOrder.findFirst({
    where: { id, outletId: outlet.id },
    include: {
      supplier: true,
      lines: { include: { rawMaterial: true } },
      grns: { select: { id: true, grnNo: true, status: true, receivedAt: true } },
    },
  });
  if (!po) return notFound();

  const requiresCC = (outlet as any).requireCostControlApproval ?? true;
  const canApproveCC = !!user && canAccess(user.role, "inventory.purchase.approve");
  const ccApproverName = po.ccApprovedById
    ? (await db.user.findUnique({ where: { id: po.ccApprovedById }, select: { name: true } }))?.name
    : null;

  return (
    <div>
      <PageHeader
        title={po.poNo}
        description={`${po.supplier.name} · ${new Date(po.createdAt).toLocaleString("en-IN")}`}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/inventory/purchase">
                <ArrowLeft className="h-4 w-4" />
                All POs
              </Link>
            </Button>
            <PrintPoButton />

            {/* DRAFT — editable until submitted; then submit for CC approval */}
            {po.status === "DRAFT" && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/inventory/purchase/${po.id}/edit`}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Link>
                </Button>
                <SubmitForApprovalButton id={po.id} requiresCC={requiresCC} />
              </>
            )}

            {/* PENDING_CC_APPROVAL — only Cost Controller can act */}
            {po.status === "PENDING_CC_APPROVAL" && canApproveCC && (
              <>
                <CcApproveButton id={po.id} />
                <CcRejectButton id={po.id} />
              </>
            )}

            {/* APPROVED — SM marks as sent to vendor */}
            {po.status === "APPROVED" && (
              <form action={markSent}>
                <input type="hidden" name="id" value={po.id} />
                <Button type="submit" size="sm">
                  <Send className="h-4 w-4" />
                  Mark sent to vendor
                </Button>
              </form>
            )}

            {/* SENT / PARTIALLY_RECEIVED — receive via GRN */}
            {(po.status === "SENT" || po.status === "PARTIALLY_RECEIVED") && (
              <Button size="sm" asChild>
                <Link href={`/inventory/grn/new?po=${po.id}`}>
                  <Truck className="h-4 w-4" />
                  Receive goods (GRN)
                </Link>
              </Button>
            )}

            {/* Cancel allowed until goods start arriving */}
            {(po.status === "DRAFT" || po.status === "PENDING_CC_APPROVAL" || po.status === "APPROVED" || po.status === "SENT") && (
              <form action={cancelPO}>
                <input type="hidden" name="id" value={po.id} />
                <Button type="submit" size="sm" variant="outline" className="text-rose-700 hover:bg-rose-50">
                  <XCircle className="h-4 w-4" />
                  Cancel
                </Button>
              </form>
            )}
          </>
        }
      />

      {/* Rejection banner — sticks at the top so the SM can see the reason */}
      {po.status === "REJECTED" && po.ccRejectionReason && (
        <Card className="mb-3 border-rose-300 bg-rose-50/50">
          <CardContent className="p-3 flex items-start gap-2">
            <XCircle className="h-4 w-4 text-rose-700 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-rose-900 text-sm">
                Rejected by Cost Controller {ccApproverName && `(${ccApproverName})`}
              </div>
              <div className="text-sm text-rose-800 mt-0.5">{po.ccRejectionReason}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* CC approval audit row when approved or sent */}
      {ccApproverName && (po.status === "APPROVED" || po.status === "SENT" || po.status === "PARTIALLY_RECEIVED" || po.status === "CLOSED") && (
        <Card className="mb-3 border-emerald-300 bg-emerald-50/50">
          <CardContent className="p-3 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-emerald-900 text-sm">
                Approved by {ccApproverName}
                {!requiresCC && <span className="ml-1 text-xs font-normal opacity-70">(CC gate is off — auto-approved)</span>}
              </div>
              {po.ccApprovedAt && (
                <div className="text-xs text-emerald-800/80 mt-0.5">
                  {po.ccApprovedAt.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Lines</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Raw material</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {po.lines.map((l) => {
                  const remaining = Math.max(0, l.qty - l.qtyReceived);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.rawMaterial.name}</TableCell>
                      <TableCell className="text-right">
                        {l.qty} {l.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            l.qtyReceived >= l.qty
                              ? "text-emerald-700 font-semibold"
                              : l.qtyReceived > 0
                                ? "text-amber-700 font-semibold"
                                : "text-muted-foreground"
                          }
                        >
                          {l.qtyReceived} {l.unit}
                          {remaining > 0 && l.qtyReceived > 0 && (
                            <span className="text-[10px] ml-1 opacity-70">({remaining} pending)</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{inr2(l.unitPrice)}</TableCell>
                      <TableCell className="text-right font-medium">{inr2(l.lineTotal)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-2 text-sm">
            <Row label="Status" value={<Badge variant={STATUS_TONE[po.status] ?? "secondary"}>{STATUS_LABEL[po.status] ?? po.status}</Badge>} />
            <Row label="Supplier" value={po.supplier.name} />
            <Row label="Lines" value={String(po.lines.length)} />
            {po.receivedAt && (
              <Row
                label="Received"
                value={new Date(po.receivedAt).toLocaleString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              />
            )}
            <div className="flex items-center justify-between text-base font-semibold pt-2 border-t">
              <span>Grand total</span>
              <span>{inr(po.grandTotal)}</span>
            </div>
            {po.notes && <p className="text-xs text-muted-foreground pt-2 border-t">{po.notes}</p>}

            {/* GRN tally — every receive note tied to this PO */}
            {po.grns.length > 0 && (
              <div className="pt-2 border-t">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                  Goods received notes ({po.grns.length})
                </div>
                <ul className="space-y-1">
                  {po.grns.map((g) => (
                    <li key={g.id} className="text-xs flex items-center justify-between">
                      <Link href={`/inventory/grn/${g.id}`} className="font-mono hover:underline">
                        {g.grnNo}
                      </Link>
                      <Badge variant={g.status === "CLOSED" ? "success" : "warning"} className="text-[9px]">
                        {g.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Printable doc — hidden on screen, visible only when window.print() runs */}
      <div className="print-doc">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #000", paddingBottom: 8, marginBottom: 12 }}>
          <div>
            <h1>{outlet.name}</h1>
            <div className="muted">{outlet.address ?? ""}</div>
            <div className="muted">GSTIN: {outlet.gstin ?? "—"}</div>
            <div className="muted">Phone: {outlet.phone ?? "—"}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <h1 style={{ fontSize: 18 }}>PURCHASE ORDER</h1>
            <div className="muted">{po.poNo}</div>
            <div className="muted">{new Date(po.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</div>
            <div className="muted">Status: {po.status}</div>
          </div>
        </div>

        <h2>Vendor</h2>
        <div>
          <strong>{po.supplier.name}</strong>
          {po.supplier.contact && <div className="muted">Contact: {po.supplier.contact}</div>}
          {po.supplier.phone && <div className="muted">Phone: {po.supplier.phone}</div>}
          {po.supplier.gstin && <div className="muted">GSTIN: {po.supplier.gstin}</div>}
          {po.supplier.address && <div className="muted">{po.supplier.address}</div>}
        </div>

        <h2>Line items</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: "8%" }}>#</th>
              <th>Item</th>
              <th className="text-right" style={{ width: "15%" }}>Qty</th>
              <th className="text-right" style={{ width: "20%" }}>Unit price</th>
              <th className="text-right" style={{ width: "20%" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((l, i) => (
              <tr key={l.id}>
                <td>{i + 1}</td>
                <td>{l.rawMaterial.name}</td>
                <td className="text-right">{l.qty} {l.unit}</td>
                <td className="text-right">{inr2(l.unitPrice)}</td>
                <td className="text-right">{inr2(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="text-right" style={{ fontWeight: 700 }}>Grand total</td>
              <td className="text-right" style={{ fontWeight: 700 }}>{inr(po.grandTotal)}</td>
            </tr>
          </tfoot>
        </table>

        {po.notes && (
          <>
            <h2>Notes</h2>
            <div className="muted">{po.notes}</div>
          </>
        )}

        <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
          <div>
            <div style={{ borderTop: "1px solid #000", paddingTop: 4 }} className="muted">Authorised signatory · {outlet.name}</div>
          </div>
          <div>
            <div style={{ borderTop: "1px solid #000", paddingTop: 4 }} className="muted">Received by · {po.supplier.name}</div>
          </div>
        </div>
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
