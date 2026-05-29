import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr, inr2 } from "@/lib/utils";
import { ArrowLeft, Send, PackageCheck, XCircle, Printer } from "lucide-react";
import { markSent, receivePO, cancelPO } from "../actions";
import { PrintPoButton } from "./client";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "secondary" | "info" | "success" | "destructive"> = {
  DRAFT: "secondary",
  SENT: "info",
  RECEIVED: "success",
  CANCELLED: "destructive",
};

export default async function PODetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const outlet = await getActiveOutlet();
  const po = await db.purchaseOrder.findFirst({
    where: { id, outletId: outlet.id },
    include: {
      supplier: true,
      lines: { include: { rawMaterial: true } },
    },
  });
  if (!po) return notFound();

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
            {po.status === "DRAFT" && (
              <form action={markSent}>
                <input type="hidden" name="id" value={po.id} />
                <Button type="submit" size="sm" variant="outline">
                  <Send className="h-4 w-4" />
                  Mark sent
                </Button>
              </form>
            )}
            {(po.status === "DRAFT" || po.status === "SENT") && (
              <>
                <form action={receivePO}>
                  <input type="hidden" name="id" value={po.id} />
                  <Button type="submit" size="sm">
                    <PackageCheck className="h-4 w-4" />
                    Mark received
                  </Button>
                </form>
                <form action={cancelPO}>
                  <input type="hidden" name="id" value={po.id} />
                  <Button type="submit" size="sm" variant="destructive">
                    <XCircle className="h-4 w-4" />
                    Cancel
                  </Button>
                </form>
              </>
            )}
          </>
        }
      />

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
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {po.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.rawMaterial.name}</TableCell>
                    <TableCell className="text-right">
                      {l.qty} {l.unit}
                    </TableCell>
                    <TableCell className="text-right">{inr2(l.unitPrice)}</TableCell>
                    <TableCell className="text-right font-medium">{inr2(l.lineTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-2 text-sm">
            <Row label="Status" value={<Badge variant={STATUS_TONE[po.status] ?? "secondary"}>{po.status}</Badge>} />
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
