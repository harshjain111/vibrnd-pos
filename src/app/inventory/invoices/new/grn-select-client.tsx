"use client";
/**
 * Supplier → GRN multi-select → invoice details, per spec section 5.
 *
 *   Step 1: Pick supplier (only vendors with pending GRNs show up)
 *   Step 2: System surfaces their CLOSED GRNs not yet covered by an
 *           invoice, with date-range + GRN-no filters and a multi-select
 *   Step 3: Selected GRNs auto-populate the invoice lines (qty + rate
 *           + tax/discount inherited from the GRN); SM can tweak.
 *   Step 4: Enter vendor invoice no / date / amount + optional file URL
 *   Step 5: Submit → server routes to MATCHED or DISPUTED based on
 *           invoiceAmount vs sum(grn.landedTotal).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Truck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { createVendorInvoice } from "../actions";
import { inr, inr2 } from "@/lib/utils";

type SupplierOpt = { id: string; name: string; grnCount: number; pendingTotal: number };
type GrnLine = {
  rawMaterialId: string;
  name: string;
  unit: string;
  qty: number;
  unitPrice: number;
  taxPct: number;
  taxRate: number;
  lineDiscount: number;
};
type GrnEntry = {
  id: string;
  grnNo: string;
  receivedAt: string;
  landedTotal: number;
  poNo: string;
  lines: GrnLine[];
};

type LineRow = {
  rawMaterialId: string;
  name: string;
  unit: string;
  qty: string;
  unitPrice: string;
  taxRate: string;
};

export function GrnSelectForm({
  suppliers,
  grnsBySupplier,
}: {
  suppliers: SupplierOpt[];
  grnsBySupplier: Record<string, GrnEntry[]>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();

  const [supplierId, setSupplierId] = React.useState<string>(suppliers[0]?.id ?? "");
  const [filterFrom, setFilterFrom] = React.useState("");
  const [filterTo, setFilterTo] = React.useState("");
  const [filterGrn, setFilterGrn] = React.useState("");
  const [pickedGrnIds, setPickedGrnIds] = React.useState<Set<string>>(new Set());

  const [invoiceNo, setInvoiceNo] = React.useState("");
  const [invoiceDate, setInvoiceDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [invoiceAmount, setInvoiceAmount] = React.useState("");
  const [fileUrl, setFileUrl] = React.useState("");
  const [notes, setNotes] = React.useState("");
  // Lines start empty; rebuilt every time the GRN selection changes.
  // Keyed by `${grnId}::${rawMaterialId}` so the same RM across two GRNs
  // shows as separate editable rows.
  const [lines, setLines] = React.useState<(LineRow & { key: string; grnId: string })[]>([]);

  // Reset filters + selection when supplier changes.
  React.useEffect(() => {
    setPickedGrnIds(new Set());
    setLines([]);
    setFilterFrom("");
    setFilterTo("");
    setFilterGrn("");
  }, [supplierId]);

  const allGrns = grnsBySupplier[supplierId] ?? [];
  const filteredGrns = React.useMemo(() => {
    return allGrns.filter((g) => {
      if (filterGrn && !g.grnNo.toLowerCase().includes(filterGrn.toLowerCase())) return false;
      const d = new Date(g.receivedAt);
      if (filterFrom && d < new Date(filterFrom)) return false;
      if (filterTo) {
        const end = new Date(filterTo);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }
      return true;
    });
  }, [allGrns, filterFrom, filterTo, filterGrn]);

  const toggleGrn = (g: GrnEntry) => {
    setPickedGrnIds((prev) => {
      const next = new Set(prev);
      if (next.has(g.id)) {
        next.delete(g.id);
        setLines((ls) => ls.filter((l) => l.grnId !== g.id));
      } else {
        next.add(g.id);
        setLines((ls) => [
          ...ls,
          ...g.lines.map((l) => ({
            key: `${g.id}::${l.rawMaterialId}::${Math.random().toString(36).slice(2, 6)}`,
            grnId: g.id,
            rawMaterialId: l.rawMaterialId,
            name: l.name,
            unit: l.unit,
            qty: String(l.qty),
            unitPrice: String(l.unitPrice),
            taxRate: String(l.taxRate || l.taxPct || 0),
          })),
        ]);
      }
      return next;
    });
  };

  const updateLine = (key: string, patch: Partial<LineRow>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  // Live computation: expectedAmount = sum of selected GRN landedTotals.
  // headerTotal = sum of line totals (qty × rate × (1 + tax%)). The
  // server computes variance = invoiceAmount − expectedAmount and
  // auto-routes the review status.
  const expected = React.useMemo(
    () => allGrns.filter((g) => pickedGrnIds.has(g.id)).reduce((s, g) => s + g.landedTotal, 0),
    [allGrns, pickedGrnIds]
  );
  const headerTotal = React.useMemo(() => {
    let t = 0;
    for (const l of lines) {
      const q = Number(l.qty) || 0;
      const p = Number(l.unitPrice) || 0;
      const r = Number(l.taxRate) || 0;
      t += q * p + (q * p * r) / 100;
    }
    return t;
  }, [lines]);
  const invAmt = Number(invoiceAmount) || headerTotal;
  const variance = Math.round((invAmt - expected) * 100) / 100;

  const submit = () => {
    if (!supplierId) return toast({ variant: "destructive", title: "Pick a supplier" });
    if (!invoiceNo.trim()) return toast({ variant: "destructive", title: "Invoice number required" });
    if (pickedGrnIds.size === 0) {
      return toast({ variant: "destructive", title: "Pick at least one GRN" });
    }
    const payloadLines = lines
      .map((l) => ({
        rawMaterialId: l.rawMaterialId,
        description: l.name,
        qty: Number(l.qty) || 0,
        unit: l.unit,
        unitPrice: Number(l.unitPrice) || 0,
        taxRate: Number(l.taxRate) || 0,
      }))
      .filter((l) => l.qty > 0);
    if (payloadLines.length === 0) {
      return toast({ variant: "destructive", title: "Every line has qty 0 — nothing to bill" });
    }

    // Apportion the (vendor-stated or header-derived) invoice amount
    // across the linked GRNs by landedTotal share, so the per-GRN
    // accrual column on VendorInvoiceGrnLink stays useful for reports.
    const stated = Number(invoiceAmount) || headerTotal;
    const picked = allGrns.filter((g) => pickedGrnIds.has(g.id));
    const totalLanded = picked.reduce((s, g) => s + g.landedTotal, 0);
    const grnLinks = picked.map((g, i) => ({
      grnId: g.id,
      amount:
        totalLanded > 0
          ? i === picked.length - 1
            ? // last row picks up the rounding remainder so the splits
              // sum exactly to `stated`
              Math.round((stated - picked.slice(0, -1).reduce((s, x) => s + (stated * x.landedTotal) / totalLanded, 0)) * 100) / 100
            : Math.round((stated * g.landedTotal / totalLanded) * 100) / 100
          : Math.round((stated / picked.length) * 100) / 100,
    }));

    startTransition(async () => {
      try {
        await createVendorInvoice({
          supplierId,
          invoiceNo: invoiceNo.trim(),
          invoiceDate,
          invoiceAmount: invoiceAmount ? Number(invoiceAmount) : undefined,
          fileUrl: fileUrl || undefined,
          notes: notes || undefined,
          grnLinks,
          lines: payloadLines,
        });
        // server-side redirect handles navigation
      } catch (e: any) {
        toast({ variant: "destructive", title: "Couldn't save invoice", description: e?.message ?? String(e) });
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Step 1 — Supplier */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">1. Pick supplier</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="h-9 w-full max-w-md rounded-md border bg-background px-2 text-sm"
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.grnCount} pending GRN{s.grnCount === 1 ? "" : "s"} · {inr(Math.round(s.pendingTotal))}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Step 2 — pending GRNs with filters + multi-select */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>2. Select GRNs the vendor's bill covers</span>
            <span className="text-xs font-normal text-muted-foreground">
              {pickedGrnIds.size} of {allGrns.length} picked
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">From date</Label>
              <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">To date</Label>
              <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">GRN no</Label>
              <Input
                value={filterGrn}
                onChange={(e) => setFilterGrn(e.target.value)}
                placeholder="search"
                className="h-9"
              />
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2 w-8"></th>
                  <th className="text-left p-2">GRN</th>
                  <th className="text-left p-2 w-32">Received</th>
                  <th className="text-left p-2 w-28">PO</th>
                  <th className="text-right p-2 w-20">Items</th>
                  <th className="text-right p-2 w-28">Landed total</th>
                </tr>
              </thead>
              <tbody>
                {filteredGrns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                      No pending GRNs match the filters.
                    </td>
                  </tr>
                ) : (
                  filteredGrns.map((g) => {
                    const picked = pickedGrnIds.has(g.id);
                    return (
                      <tr
                        key={g.id}
                        className={"border-t cursor-pointer " + (picked ? "bg-primary/5" : "hover:bg-accent/40")}
                        onClick={() => toggleGrn(g)}
                      >
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={picked}
                            onChange={() => toggleGrn(g)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-3.5 w-3.5"
                          />
                        </td>
                        <td className="p-2 font-mono text-xs">{g.grnNo}</td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {new Date(g.receivedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                        </td>
                        <td className="p-2 text-xs">
                          <Badge variant="outline" className="text-[10px]">{g.poNo}</Badge>
                        </td>
                        <td className="p-2 text-right text-xs">{g.lines.length}</td>
                        <td className="p-2 text-right font-medium tabular-nums">{inr(Math.round(g.landedTotal))}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {pickedGrnIds.size > 0 && (
            <div className="rounded-md border bg-emerald-50/40 border-emerald-300 p-2 text-xs flex items-center justify-between">
              <span className="text-emerald-900 inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {pickedGrnIds.size} GRN{pickedGrnIds.size === 1 ? "" : "s"} selected
              </span>
              <span className="text-emerald-900 font-semibold">
                Expected: {inr(Math.round(expected))}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 3 — line items auto-populated from selected GRNs */}
      {lines.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">3. Lines (auto-loaded from selected GRNs)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left p-2">Item</th>
                    <th className="text-right p-2 w-20">Qty</th>
                    <th className="text-right p-2 w-24">Rate (₹)</th>
                    <th className="text-right p-2 w-16">Tax %</th>
                    <th className="text-right p-2 w-24">Line ₹</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const q = Number(l.qty) || 0;
                    const p = Number(l.unitPrice) || 0;
                    const r = Number(l.taxRate) || 0;
                    const total = q * p + (q * p * r) / 100;
                    return (
                      <tr key={l.key} className="border-t">
                        <td className="p-2">
                          <div className="font-medium">{l.name}</div>
                          <div className="text-[10px] text-muted-foreground">{l.unit}</div>
                        </td>
                        <td className="p-2 text-right">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.qty}
                            onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                            className="h-8 w-20 text-right ml-auto"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.unitPrice}
                            onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
                            className="h-8 w-24 text-right ml-auto"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.taxRate}
                            onChange={(e) => updateLine(l.key, { taxRate: e.target.value })}
                            className="h-8 w-16 text-right ml-auto"
                          />
                        </td>
                        <td className="p-2 text-right tabular-nums text-xs">{total > 0 ? inr2(total) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/40 font-semibold">
                    <td className="p-2 text-right" colSpan={4}>Line items total</td>
                    <td className="p-2 text-right tabular-nums">{inr2(headerTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4 — invoice header */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">4. Invoice details</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Invoice no</Label>
              <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="e.g. INV-2026/0042" />
            </div>
            <div>
              <Label>Invoice date</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div>
              <Label>Vendor's stated amount (₹)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={invoiceAmount}
                onChange={(e) => setInvoiceAmount(e.target.value)}
                placeholder={`Defaults to ${inr(Math.round(headerTotal))} from lines`}
              />
            </div>
            <div className="md:col-span-3">
              <Label>Invoice file URL (optional)</Label>
              <Input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="Supabase storage path or external link" />
            </div>
            <div className="md:col-span-3">
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any reference" />
            </div>
          </div>

          {/* Live variance preview */}
          {pickedGrnIds.size > 0 && invAmt > 0 && (
            <div
              className={
                "rounded-md border p-3 text-sm " +
                (Math.abs(variance) < 1
                  ? "bg-emerald-50/40 border-emerald-300"
                  : variance > 0
                  ? "bg-amber-50/40 border-amber-400"
                  : "bg-sky-50/40 border-sky-300")
              }
            >
              <div className="flex items-center gap-2 font-semibold mb-1">
                {variance > 0 && <AlertTriangle className="h-4 w-4 text-amber-700" />}
                {variance > 0
                  ? "Vendor billed more than expected — invoice will route to CC"
                  : variance < 0
                  ? "Vendor billed less than expected — will land as MATCHED"
                  : "Matches expected exactly — will land as MATCHED"}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="uppercase tracking-wider text-muted-foreground text-[10px]">Expected</div>
                  <div className="font-medium tabular-nums">{inr(Math.round(expected))}</div>
                </div>
                <div>
                  <div className="uppercase tracking-wider text-muted-foreground text-[10px]">Vendor billed</div>
                  <div className="font-medium tabular-nums">{inr(Math.round(invAmt))}</div>
                </div>
                <div>
                  <div className="uppercase tracking-wider text-muted-foreground text-[10px]">Variance</div>
                  <div className={"font-medium tabular-nums " + (variance > 0 ? "text-amber-700" : variance < 0 ? "text-emerald-700" : "")}>
                    {variance > 0 ? "+" : ""}{inr(Math.round(variance))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button onClick={submit} disabled={pending} size="lg">
          <Truck className="h-4 w-4" />
          {pending ? "Saving…" : "Save invoice"}
        </Button>
      </div>
    </div>
  );
}
