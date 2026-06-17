"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { FileText } from "lucide-react";
import { createVendorInvoice } from "../actions";
import { inr } from "@/lib/utils";
import { isRedirectError } from "@/lib/next-action";

type CatalogRow = {
  rawMaterialId: string;
  name: string;
  unit: string;
  taxPct: number;
  ordered: number;
  billed: number;
  remaining: number;
  unitPrice: number;
};

type LineRow = {
  rawMaterialId: string;
  name: string;
  unit: string;
  remaining: number;
  qty: string;
  unitPrice: string;
  taxRate: string;
  include: boolean;
};

/**
 * PO-first Stock Purchase form. The PO is already chosen, so the supplier is
 * fixed and lines are prefilled from the PO (remaining qty). The user adjusts
 * qty/rate/tax to match the printed supplier bill and saves. Qty per line is
 * capped to what's left to bill against the PO.
 */
export function NewStockPurchaseForm({
  poId,
  poNo,
  supplierId,
  supplierName,
  catalog,
}: {
  poId: string;
  poNo: string;
  supplierId: string;
  supplierName: string;
  catalog: CatalogRow[];
}) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [invoiceNo, setInvoiceNo] = React.useState("");
  const [invoiceDate, setInvoiceDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [fileUrl, setFileUrl] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<LineRow[]>(() =>
    catalog.map((c) => ({
      rawMaterialId: c.rawMaterialId,
      name: c.name,
      unit: c.unit,
      remaining: c.remaining,
      qty: c.remaining > 0 ? String(c.remaining) : "",
      unitPrice: c.unitPrice ? String(c.unitPrice) : "",
      taxRate: c.taxPct ? String(c.taxPct) : "",
      include: c.remaining > 0,
    }))
  );

  const update = (rmId: string, patch: Partial<LineRow>) =>
    setLines((ls) => ls.map((l) => (l.rawMaterialId === rmId ? { ...l, ...patch } : l)));

  const totals = React.useMemo(() => {
    let sub = 0;
    let tax = 0;
    for (const l of lines) {
      if (!l.include) continue;
      const q = Number(l.qty) || 0;
      const p = Number(l.unitPrice) || 0;
      const t = Number(l.taxRate) || 0;
      const lineSub = q * p;
      sub += lineSub;
      tax += (lineSub * t) / 100;
    }
    return { sub, tax, grand: sub + tax };
  }, [lines]);

  const submit = () => {
    if (!invoiceNo.trim()) return toast({ variant: "destructive", title: "Invoice # required" });
    const chosen = lines.filter((l) => l.include && Number(l.qty) > 0);
    if (chosen.length === 0) {
      return toast({ variant: "destructive", title: "Add at least one item with qty > 0" });
    }
    for (const l of chosen) {
      if (Number(l.qty) > l.remaining + 0.001) {
        return toast({
          variant: "destructive",
          title: `${l.name}: ${l.qty} exceeds remaining PO budget ${l.remaining}`,
        });
      }
    }

    startTransition(async () => {
      try {
        await createVendorInvoice({
          supplierId,
          poId,
          invoiceNo: invoiceNo.trim(),
          invoiceDate,
          fileUrl: fileUrl || undefined,
          notes: notes || undefined,
          lines: chosen.map((l) => ({
            rawMaterialId: l.rawMaterialId,
            qty: Number(l.qty),
            unit: l.unit,
            unitPrice: Number(l.unitPrice) || 0,
            taxRate: Number(l.taxRate) || 0,
          })),
        });
        // server redirects to the detail page on success
      } catch (e) {
        if (isRedirectError(e)) throw e;
        toast({ variant: "destructive", title: "Couldn't save stock purchase", description: String(e) });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <Label>Supplier</Label>
          <div className="h-9 rounded-md border bg-muted/50 px-3 flex items-center text-sm">
            {supplierName}
          </div>
        </div>
        <div>
          <Label>Invoice number (supplier&apos;s)</Label>
          <Input
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
            placeholder="e.g. INV/2026-06/12345"
          />
        </div>
        <div>
          <Label>Invoice date</Label>
          <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Items from {poNo}</Label>
        <div className="rounded-md border overflow-x-auto mt-1">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-2 w-10"></th>
                <th className="text-left p-2">Raw material</th>
                <th className="text-left p-2 w-16">Unit</th>
                <th className="text-right p-2 w-28">Remaining</th>
                <th className="text-right p-2 w-24">Qty</th>
                <th className="text-right p-2 w-32">Rate ₹</th>
                <th className="text-right p-2 w-20">Tax %</th>
                <th className="text-right p-2 w-28">Line total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const enteredQty = Number(l.qty) || 0;
                const overCap = enteredQty > l.remaining + 0.001;
                const lineSub = enteredQty * (Number(l.unitPrice) || 0);
                const lineTotal = lineSub + (lineSub * (Number(l.taxRate) || 0)) / 100;
                return (
                  <tr key={l.rawMaterialId} className={`border-t ${l.include ? "" : "opacity-50"}`}>
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={l.include}
                        onChange={(e) => update(l.rawMaterialId, { include: e.target.checked })}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="p-2 font-medium">{l.name}</td>
                    <td className="p-2 text-xs text-muted-foreground">{l.unit}</td>
                    <td className="p-2 text-right text-xs text-muted-foreground tabular-nums">
                      {l.remaining} {l.unit}
                    </td>
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.qty}
                        disabled={!l.include}
                        onChange={(e) => update(l.rawMaterialId, { qty: e.target.value })}
                        className={`h-8 w-20 text-right ml-auto ${overCap ? "border-rose-500" : ""}`}
                      />
                    </td>
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.unitPrice}
                        disabled={!l.include}
                        onChange={(e) => update(l.rawMaterialId, { unitPrice: e.target.value })}
                        className="h-8 w-28 text-right ml-auto"
                      />
                    </td>
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.taxRate}
                        disabled={!l.include}
                        onChange={(e) => update(l.rawMaterialId, { taxRate: e.target.value })}
                        className="h-8 w-16 text-right ml-auto"
                      />
                    </td>
                    <td className="p-2 text-right font-medium tabular-nums">
                      {lineTotal > 0 && l.include ? inr(Math.round(lineTotal)) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="text-[11px] text-muted-foreground mt-1">
          Untick any item the supplier didn&apos;t bill on this invoice. Quantities are capped to
          what&apos;s left to bill against {poNo}.
        </div>
      </div>

      <div className="rounded-md border bg-muted/30 p-3 grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sub total</div>
          <div className="text-base font-semibold tabular-nums">{inr(Math.round(totals.sub))}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Tax total</div>
          <div className="text-base font-semibold tabular-nums">{inr(Math.round(totals.tax))}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Grand total</div>
          <div className="text-lg font-bold tabular-nums">{inr(Math.round(totals.grand))}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label>Uploaded file URL (optional)</Label>
          <Input
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            placeholder="Supabase Storage signed URL"
          />
        </div>
        <div>
          <Label>Notes (optional)</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any reference" />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t">
        <Button onClick={submit} disabled={pending}>
          <FileText className="h-4 w-4" />
          {pending ? "Saving…" : "Save stock purchase"}
        </Button>
      </div>
    </div>
  );
}
