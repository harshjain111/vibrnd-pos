"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { AlertTriangle, FileText, Plus, Trash2, Wand2 } from "lucide-react";
import { createVendorInvoice } from "../actions";
import { inr } from "@/lib/utils";

type Supplier = { id: string; name: string };
type GrnOption = {
  id: string;
  grnNo: string;
  poNo: string | null;
  supplierId: string | null;
  receivedAt: string;
  value: number;
};
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
type ReceiptHint = {
  rawMaterialId: string;
  name: string;
  qtyReceived: number;
  unit: string;
  unitPrice: number;
  taxPct: number;
};

type LineRow = {
  key: string;
  rawMaterialId: string;
  qty: string;
  unitPrice: string;
  taxRate: string;
};

function newLine(): LineRow {
  return {
    key: Math.random().toString(36).slice(2),
    rawMaterialId: "",
    qty: "",
    unitPrice: "",
    taxRate: "",
  };
}

export function NewInvoiceForm({
  suppliers,
  initialSupplierId,
  initialGrnId,
  eligibleGrns,
  poItemCatalog,
  grnReceiptHints,
}: {
  suppliers: Supplier[];
  initialSupplierId: string;
  initialGrnId: string | null;
  eligibleGrns: GrnOption[];
  /** Items on the linked POs + remaining qty after prior invoices. Empty
   *  when every linked GRN is ad-hoc — in that case the form lets you pick
   *  any item from the seed GRN's lines and skips the qty cap. */
  poItemCatalog: CatalogRow[];
  /** Items + receipts on the seed GRN. Used when there's no PO context to
   *  give the user something to drag into the line builder. */
  grnReceiptHints: ReceiptHint[];
}) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [supplierId, setSupplierId] = React.useState(initialSupplierId);
  const [invoiceNo, setInvoiceNo] = React.useState("");
  const [invoiceDate, setInvoiceDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [fileUrl, setFileUrl] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [selectedGrns, setSelectedGrns] = React.useState<Set<string>>(
    new Set(initialGrnId ? [initialGrnId] : [])
  );
  const [lines, setLines] = React.useState<LineRow[]>([newLine()]);

  const catalogByRm = React.useMemo(
    () => new Map(poItemCatalog.map((r) => [r.rawMaterialId, r])),
    [poItemCatalog]
  );
  const hintsByRm = React.useMemo(
    () => new Map(grnReceiptHints.map((r) => [r.rawMaterialId, r])),
    [grnReceiptHints]
  );

  const hasPoContext = poItemCatalog.length > 0;
  // When the catalog is empty (every linked GRN is ad-hoc) fall back to the
  // seed GRN's received items as the item picker — uncapped.
  const itemOptions: { rawMaterialId: string; name: string; unit: string; remaining: number | null; taxPct: number; lastUnitPrice: number }[] =
    hasPoContext
      ? poItemCatalog.map((r) => ({
          rawMaterialId: r.rawMaterialId,
          name: r.name,
          unit: r.unit,
          remaining: r.remaining,
          taxPct: r.taxPct,
          lastUnitPrice: r.lastUnitPrice,
        }))
      : grnReceiptHints.map((r) => ({
          rawMaterialId: r.rawMaterialId,
          name: r.name,
          unit: r.unit,
          remaining: null,
          taxPct: r.taxPct,
          lastUnitPrice: r.unitPrice,
        }));

  const toggleGrn = (id: string) =>
    setSelectedGrns((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addLine = () => setLines((ls) => [...ls, newLine()]);
  const removeLine = (key: string) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  const updateLine = (key: string, patch: Partial<LineRow>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const onPickRm = (key: string, rmId: string) => {
    const item = itemOptions.find((o) => o.rawMaterialId === rmId);
    updateLine(key, {
      rawMaterialId: rmId,
      unitPrice: item?.lastUnitPrice ? String(item.lastUnitPrice) : "",
      taxRate: item?.taxPct ? String(item.taxPct) : "",
    });
  };

  // "Load from PO" — fills empty lines with one row per catalog item using
  // its remaining qty. Skips items already present in the editor.
  const loadFromPo = () => {
    if (!hasPoContext) return;
    const existing = new Set(lines.map((l) => l.rawMaterialId).filter(Boolean));
    const fresh: LineRow[] = [];
    for (const r of poItemCatalog) {
      if (existing.has(r.rawMaterialId)) continue;
      if (r.remaining <= 0) continue;
      fresh.push({
        key: Math.random().toString(36).slice(2),
        rawMaterialId: r.rawMaterialId,
        qty: String(r.remaining),
        unitPrice: r.lastUnitPrice ? String(r.lastUnitPrice) : "",
        taxRate: r.taxPct ? String(r.taxPct) : "",
      });
    }
    if (fresh.length === 0) {
      toast({ title: "Nothing to load — every PO item is already on the invoice" });
      return;
    }
    // Drop the trailing empty row if there is one.
    const cleaned = lines.filter((l) => l.rawMaterialId || Number(l.qty) > 0);
    setLines([...cleaned, ...fresh]);
  };

  // Live totals
  const totals = React.useMemo(() => {
    let sub = 0;
    let tax = 0;
    for (const l of lines) {
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
    if (!supplierId) return toast({ variant: "destructive", title: "Pick a supplier" });
    if (!invoiceNo.trim()) return toast({ variant: "destructive", title: "Invoice # required" });
    if (selectedGrns.size === 0)
      return toast({ variant: "destructive", title: "Link at least one GRN" });

    const cleaned = lines.filter((l) => l.rawMaterialId && Number(l.qty) > 0);
    if (cleaned.length === 0) {
      return toast({
        variant: "destructive",
        title: "Add at least one line with item + qty > 0",
      });
    }

    // Client-side guardrail mirroring the server cap so the user gets fast
    // feedback before round-tripping. Server is still the source of truth.
    if (hasPoContext) {
      const byRm = new Map<string, number>();
      for (const l of cleaned) {
        byRm.set(l.rawMaterialId, (byRm.get(l.rawMaterialId) ?? 0) + Number(l.qty));
      }
      for (const [rmId, qty] of byRm) {
        const cat = catalogByRm.get(rmId);
        if (!cat) {
          return toast({
            variant: "destructive",
            title: "Item isn't on the linked POs",
          });
        }
        if (qty > cat.remaining + 0.001) {
          return toast({
            variant: "destructive",
            title: `${cat.name}: ${qty} exceeds remaining PO budget ${cat.remaining}`,
            description: `Ordered ${cat.ordered}, already invoiced ${cat.alreadyInvoiced}.`,
          });
        }
      }
    }

    startTransition(async () => {
      try {
        await createVendorInvoice({
          supplierId,
          invoiceNo: invoiceNo.trim(),
          invoiceDate,
          fileUrl: fileUrl || undefined,
          notes: notes || undefined,
          grnLinks: Array.from(selectedGrns).map((id) => ({ grnId: id, amount: 0 })),
          lines: cleaned.map((l) => {
            const item = itemOptions.find((o) => o.rawMaterialId === l.rawMaterialId);
            return {
              rawMaterialId: l.rawMaterialId,
              qty: Number(l.qty),
              unit: item?.unit ?? "kg",
              unitPrice: Number(l.unitPrice) || 0,
              taxRate: Number(l.taxRate) || 0,
            };
          }),
        });
        // server redirects to detail
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't save invoice", description: String(e) });
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Header fields */}
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <Label>Supplier</Label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Pick supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Invoice number (vendor's)</Label>
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

      {/* GRN selector */}
      <div>
        <Label>Linked GRNs ({selectedGrns.size})</Label>
        <div className="rounded-md border max-h-48 overflow-y-auto mt-1">
          {eligibleGrns.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No GRNs available. Save a GRN first.
            </div>
          ) : (
            <ul className="divide-y">
              {eligibleGrns.map((g) => {
                const checked = selectedGrns.has(g.id);
                return (
                  <li
                    key={g.id}
                    className={`flex items-center gap-3 p-2 cursor-pointer transition-colors ${
                      checked ? "bg-primary/5" : "hover:bg-accent/40"
                    }`}
                    onClick={() => toggleGrn(g.id)}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleGrn(g.id)}
                      className="h-4 w-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono">{g.grnNo}</div>
                      <div className="text-xs text-muted-foreground">
                        {g.poNo ? (
                          `Against PO ${g.poNo}`
                        ) : (
                          <Badge variant="warning" className="text-[9px]">
                            Ad-hoc
                          </Badge>
                        )}
                        {" · "}
                        {new Date(g.receivedAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })}
                      </div>
                    </div>
                    <div className="text-sm font-medium text-right shrink-0">{inr(g.value)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground mt-1">
          Tick every GRN this single invoice covers. If the vendor batches multiple
          deliveries into one bill, include them all here.
        </div>
      </div>

      {/* Line items */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label>Line items as printed on the vendor's invoice</Label>
          <div className="flex gap-1">
            {hasPoContext && (
              <Button type="button" variant="outline" size="sm" onClick={loadFromPo}>
                <Wand2 className="h-3.5 w-3.5" /> Load from PO
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={addLine}>
              <Plus className="h-3.5 w-3.5" /> Add line
            </Button>
          </div>
        </div>

        {!hasPoContext && (
          <div className="rounded-md border border-amber-300 bg-amber-50/40 p-2 mb-2 flex items-start gap-2 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-amber-900">No PO context.</span>{" "}
              <span className="text-amber-800">
                Every linked GRN is ad-hoc — qty isn't capped against a purchase order.
                Items below come from the seed GRN's receipts.
              </span>
            </div>
          </div>
        )}

        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-2">Raw material</th>
                <th className="text-left p-2 w-20">Unit</th>
                <th className="text-right p-2 w-24">Qty</th>
                {hasPoContext && <th className="text-right p-2 w-28">Cap (remaining)</th>}
                <th className="text-right p-2 w-32">Unit price ₹</th>
                <th className="text-right p-2 w-20">Tax %</th>
                <th className="text-right p-2 w-28">Line total</th>
                <th className="text-right p-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const item = l.rawMaterialId
                  ? itemOptions.find((o) => o.rawMaterialId === l.rawMaterialId)
                  : null;
                const cat = hasPoContext && l.rawMaterialId ? catalogByRm.get(l.rawMaterialId) : null;
                const enteredQty = Number(l.qty) || 0;
                const overCap = cat && enteredQty > cat.remaining + 0.001;
                const lineSub = (Number(l.qty) || 0) * (Number(l.unitPrice) || 0);
                const lineTax = (lineSub * (Number(l.taxRate) || 0)) / 100;
                const lineTotal = lineSub + lineTax;
                return (
                  <tr key={l.key} className="border-t">
                    <td className="p-2">
                      <select
                        value={l.rawMaterialId}
                        onChange={(e) => onPickRm(l.key, e.target.value)}
                        className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                      >
                        <option value="">Pick an item…</option>
                        {itemOptions.map((o) => (
                          <option key={o.rawMaterialId} value={o.rawMaterialId}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{item?.unit ?? "—"}</td>
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.qty}
                        onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                        className={`h-8 w-20 text-right ml-auto ${
                          overCap ? "border-rose-500" : ""
                        }`}
                      />
                    </td>
                    {hasPoContext && (
                      <td className="p-2 text-right text-xs">
                        {cat ? (
                          <span
                            className={`tabular-nums ${
                              overCap
                                ? "text-rose-700 font-semibold"
                                : "text-muted-foreground"
                            }`}
                          >
                            {cat.remaining} {item?.unit ?? ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.unitPrice}
                        onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
                        className="h-8 w-28 text-right ml-auto"
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
                    <td className="p-2 text-right font-medium tabular-nums">
                      {lineTotal > 0 ? inr(Math.round(lineTotal)) : "—"}
                    </td>
                    <td className="p-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLine(l.key)}
                        disabled={lines.length === 1}
                        title="Remove line"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals strip */}
      <div className="rounded-md border bg-muted/30 p-3 grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Sub total
          </div>
          <div className="text-base font-semibold tabular-nums">
            {inr(Math.round(totals.sub))}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Tax total
          </div>
          <div className="text-base font-semibold tabular-nums">
            {inr(Math.round(totals.tax))}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Grand total
          </div>
          <div className="text-lg font-bold tabular-nums">{inr(Math.round(totals.grand))}</div>
        </div>
      </div>

      {/* Extras */}
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label>Uploaded file URL (optional)</Label>
          <Input
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            placeholder="Supabase Storage signed URL — upload via Storage UI for now"
          />
        </div>
        <div>
          <Label>Notes (optional)</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any reference / PO# etc."
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t">
        <Button onClick={submit} disabled={pending}>
          <FileText className="h-4 w-4" />
          {pending ? "Saving…" : "Save invoice"}
        </Button>
      </div>
    </div>
  );
}
