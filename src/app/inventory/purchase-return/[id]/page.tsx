import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ParsedLine = {
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
  lineTotal: number;
};

export default async function PurchaseReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const outlet = await getActiveOutlet();
  const ret = await db.purchaseReturn.findFirst({ where: { id, outletId: outlet.id } });
  if (!ret) return notFound();

  let sourceType = "";
  let sourceNo = "";
  let supplierName = "";
  let lines: ParsedLine[] = [];
  try {
    if (ret.linesJson) {
      const parsed = JSON.parse(ret.linesJson);
      sourceType = parsed.sourceType ?? "";
      sourceNo = parsed.sourceNo ?? "";
      supplierName = parsed.supplierName ?? "";
      lines = Array.isArray(parsed.lines) ? parsed.lines : [];
    }
  } catch {
    /* malformed json — show header only */
  }

  return (
    <div>
      <PageHeader
        title={ret.debitNoteNo ?? "Purchase return"}
        description={`${supplierName || "Supplier"} · ${ret.debitNoteDate.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })}`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/inventory/purchase-return">
              <ArrowLeft className="h-4 w-4" /> All returns
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Returned items ({lines.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Tax %</TableHead>
                  <TableHead className="text-right">Line total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{l.name}</TableCell>
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-2 text-sm">
            <Row label="Status" value={<Badge variant="secondary" className="text-[10px]">{ret.status}</Badge>} />
            <Row label="Supplier" value={supplierName || "—"} />
            <Row label="Against" value={sourceNo ? `${sourceType === "PO" ? "PO" : "Stock purchase"} ${sourceNo}` : "—"} />
            <div className="flex items-center justify-between text-base font-semibold pt-2 border-t">
              <span>Grand total</span>
              <span>{inr(Math.round(ret.grandTotal))}</span>
            </div>
            {ret.reason && (
              <div className="pt-2 border-t">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Reason</div>
                <p className="text-xs">{ret.reason}</p>
              </div>
            )}
            <div className="pt-2 border-t text-[11px] text-muted-foreground">
              Stock for these items was reduced at the store when this debit note was created.
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
