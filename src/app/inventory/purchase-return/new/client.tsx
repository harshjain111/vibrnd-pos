"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Undo2 } from "lucide-react";
import { createPurchaseReturn } from "../actions";
import { inr } from "@/lib/utils";
import { isRedirectError } from "@/lib/next-action";

export type SourceLine = {
  rawMaterialId: string;
  name: string;
  unit: string;
  maxQty: number;
  unitPrice: number;
  taxRate: number;
};

type Row = SourceLine & { qty: string; include: boolean };

export function PurchaseReturnForm({
  supplierId,
  supplierName,
  sourceType,
  sourceId,
  sourceNo,
  lines,
}: {
  supplierId: string;
  supplierName: string;
  sourceType: "PO" | "STOCK_PURCHASE";
  sourceId: string;
  sourceNo: string;
  lines: SourceLine[];
}) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [debitNoteDate, setDebitNoteDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = React.useState("");
  const [rows, setRows] = React.useState<Row[]>(() =>
    lines.map((l) => ({ ...l, qty: "", include: false }))
  );

  const update = (rmId: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.rawMaterialId === rmId ? { ...r, ...patch } : r)));

  const totals = React.useMemo(() => {
    let sub = 0;
    let tax = 0;
    for (const r of rows) {
      if (!r.include) continue;
      const q = Number(r.qty) || 0;
      const lineSub = q * r.unitPrice;
      sub += lineSub;
      tax += (lineSub * r.taxRate) / 100;
    }
    return { sub, tax, grand: sub + tax };
  }, [rows]);

  const submit = () => {
    const chosen = rows.filter((r) => r.include && Number(r.qty) > 0);
    if (chosen.length === 0) {
      return toast({ variant: "destructive", title: "Pick at least one item with a return qty" });
    }
    for (const r of chosen) {
      if (Number(r.qty) > r.maxQty + 0.001) {
        return toast({
          variant: "destructive",
          title: `${r.name}: return qty ${r.qty} exceeds ${r.maxQty} on ${sourceNo}`,
        });
      }
    }
    startTransition(async () => {
      try {
        await createPurchaseReturn({
          supplierId,
          sourceType,
          sourceId,
          sourceNo,
          debitNoteDate,
          reason: reason || undefined,
          lines: chosen.map((r) => ({
            rawMaterialId: r.rawMaterialId,
            name: r.name,
            qty: Number(r.qty),
            unit: r.unit,
            unitPrice: r.unitPrice,
            taxRate: r.taxRate,
          })),
        });
        // server redirects to detail on success
      } catch (e) {
        if (isRedirectError(e)) throw e;
        toast({ variant: "destructive", title: "Couldn't save return", description: String(e) });
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
          <Label>Debit note date</Label>
          <Input type="date" value={debitNoteDate} onChange={(e) => setDebitNoteDate(e.target.value)} />
        </div>
        <div>
          <Label>Reason (optional)</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. damaged / expired / wrong item"
          />
        </div>
      </div>

      <div>
        <Label>Items from {sourceNo}</Label>
        <div className="rounded-md border overflow-x-auto mt-1">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-2 w-10"></th>
                <th className="text-left p-2">Raw material</th>
                <th className="text-left p-2 w-16">Unit</th>
                <th className="text-right p-2 w-28">On source</th>
                <th className="text-right p-2 w-24">Return qty</th>
                <th className="text-right p-2 w-32">Rate ₹</th>
                <th className="text-right p-2 w-20">Tax %</th>
                <th className="text-right p-2 w-28">Line total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const q = Number(r.qty) || 0;
                const over = q > r.maxQty + 0.001;
                const lineSub = q * r.unitPrice;
                const lineTotal = lineSub + (lineSub * r.taxRate) / 100;
                return (
                  <tr key={r.rawMaterialId} className={`border-t ${r.include ? "" : "opacity-50"}`}>
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={r.include}
                        onChange={(e) =>
                          update(r.rawMaterialId, {
                            include: e.target.checked,
                            qty: e.target.checked && !r.qty ? String(r.maxQty) : r.qty,
                          })
                        }
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="p-2 font-medium">{r.name}</td>
                    <td className="p-2 text-xs text-muted-foreground">{r.unit}</td>
                    <td className="p-2 text-right text-xs text-muted-foreground tabular-nums">
                      {r.maxQty} {r.unit}
                    </td>
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={r.qty}
                        disabled={!r.include}
                        onChange={(e) => update(r.rawMaterialId, { qty: e.target.value })}
                        className={`h-8 w-20 text-right ml-auto ${over ? "border-rose-500" : ""}`}
                      />
                    </td>
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={String(r.unitPrice)}
                        disabled={!r.include}
                        onChange={(e) =>
                          update(r.rawMaterialId, { unitPrice: Number(e.target.value) || 0 })
                        }
                        className="h-8 w-28 text-right ml-auto"
                      />
                    </td>
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={String(r.taxRate)}
                        disabled={!r.include}
                        onChange={(e) =>
                          update(r.rawMaterialId, { taxRate: Number(e.target.value) || 0 })
                        }
                        className="h-8 w-16 text-right ml-auto"
                      />
                    </td>
                    <td className="p-2 text-right font-medium tabular-nums">
                      {lineTotal > 0 && r.include ? inr(Math.round(lineTotal)) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="text-[11px] text-muted-foreground mt-1">
          Tick the items going back to the supplier and set the return quantity. Stock is reduced
          on save.
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

      <div className="flex items-center justify-end gap-2 pt-2 border-t">
        <Button onClick={submit} disabled={pending}>
          <Undo2 className="h-4 w-4" />
          {pending ? "Saving…" : "Create debit note"}
        </Button>
      </div>
    </div>
  );
}
