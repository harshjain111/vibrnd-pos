"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Truck, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { createGrn } from "../actions";
import { inr2 } from "@/lib/utils";

type PoLine = {
  id: string;
  rawMaterialId: string;
  name: string;
  unit: string;
  qtyOrdered: number;
  qtyAlreadyReceived: number;
  unitPrice: number;
};

type Rm = { id: string; name: string; unit: string; avgCost: number };

type AdHocLine = {
  key: string;
  rawMaterialId: string;
  qtyReceived: string;
  unitCost: string;
  taxRate: string;
  lineDiscount: string;
  note: string;
};

function newAdHocLine(): AdHocLine {
  return {
    key: Math.random().toString(36).slice(2),
    rawMaterialId: "",
    qtyReceived: "",
    unitCost: "",
    taxRate: "",
    lineDiscount: "",
    note: "",
  };
}

export function NewGrnForm({
  poId,
  poLines,
  rawMaterials,
}: {
  poId: string | null;
  poLines: PoLine[];
  rawMaterials: Rm[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [notes, setNotes] = React.useState("");
  // Bill-level charges only — per-line tax + discount land in the
  // line-item table now (spec section 3).
  const [vendorInvoiceNo, setVendorInvoiceNo] = React.useState("");
  const [vendorInvoiceDate, setVendorInvoiceDate] = React.useState("");
  const [freightCharges, setFreightCharges] = React.useState("");
  const [deliveryCharges, setDeliveryCharges] = React.useState("");
  const [otherCharges, setOtherCharges] = React.useState("");

  type PoRowState = {
    qtyReceived: string;
    qtyDamaged: string;
    batchNo: string;
    note: string;
    taxRate: string;
    lineDiscount: string;
  };

  /* ── PO mode ─────────────────────────────────────────────── */
  const [poReceive, setPoReceive] = React.useState<Record<string, PoRowState>>(() =>
    Object.fromEntries(
      poLines.map((l) => [
        l.id,
        {
          qtyReceived: String(Math.max(0, l.qtyOrdered - l.qtyAlreadyReceived)),
          qtyDamaged: "",
          batchNo: "",
          note: "",
          taxRate: "",
          lineDiscount: "",
        },
      ])
    )
  );
  const updPo = (id: string, patch: Partial<PoRowState>) =>
    setPoReceive((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  /* ── Ad-hoc mode ─────────────────────────────────────────── */
  const [adHocLines, setAdHocLines] = React.useState<AdHocLine[]>([newAdHocLine()]);
  const rmById = React.useMemo(() => new Map(rawMaterials.map((r) => [r.id, r])), [rawMaterials]);
  const addAdHoc = () => setAdHocLines((ls) => [...ls, newAdHocLine()]);
  const removeAdHoc = (key: string) =>
    setAdHocLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  const updAdHoc = (key: string, patch: Partial<AdHocLine>) =>
    setAdHocLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = (keepPoOpen: boolean) => {
    const lines = poId
      ? poLines
          .map((pl) => {
            const r = poReceive[pl.id];
            const qtyReceived = Number(r?.qtyReceived) || 0;
            const qtyDamaged = Number(r?.qtyDamaged) || 0;
            if (qtyReceived === 0 && qtyDamaged === 0) return null;
            return {
              poLineId: pl.id,
              rawMaterialId: pl.rawMaterialId,
              qtyReceived,
              qtyDamaged,
              qtyShort: Math.max(0, pl.qtyOrdered - pl.qtyAlreadyReceived - qtyReceived - qtyDamaged),
              unit: pl.unit,
              unitCost: pl.unitPrice,
              taxRate: Number(r?.taxRate) || 0,
              lineDiscount: Number(r?.lineDiscount) || 0,
              batchNo: r?.batchNo || undefined,
              note: r?.note || undefined,
            };
          })
          .filter(Boolean) as any[]
      : adHocLines
          .filter((l) => l.rawMaterialId && Number(l.qtyReceived) > 0)
          .map((l) => {
            const rm = rmById.get(l.rawMaterialId);
            return {
              rawMaterialId: l.rawMaterialId,
              qtyReceived: Number(l.qtyReceived) || 0,
              qtyDamaged: 0,
              qtyShort: 0,
              unit: rm?.unit ?? "kg",
              unitCost: Number(l.unitCost) || rm?.avgCost || 0,
              taxRate: Number(l.taxRate) || 0,
              lineDiscount: Number(l.lineDiscount) || 0,
              note: l.note || undefined,
            };
          });

    if (lines.length === 0) {
      toast({ variant: "destructive", title: "Add at least one line with qty > 0" });
      return;
    }

    startTransition(async () => {
      const res = await createGrn({
        poId: poId ?? undefined,
        notes: notes || undefined,
        keepOpen: keepPoOpen,
        vendorInvoiceNo: vendorInvoiceNo || undefined,
        vendorInvoiceDate: vendorInvoiceDate || undefined,
        freightCharges: Number(freightCharges) || 0,
        deliveryCharges: Number(deliveryCharges) || 0,
        otherCharges: Number(otherCharges) || 0,
        lines,
      });
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Couldn't save GRN",
          description: res.error,
        });
        return;
      }
      toast({
        variant: "success",
        title: keepPoOpen ? "GRN saved · PO kept open" : "GRN saved · PO closed",
      });
      router.push(`/inventory/grn/${res.id}`);
    });
  };

  return (
    <div className="space-y-4">
      {/* Lines */}
      {poId ? (
        <PoLines lines={poLines} state={poReceive} update={updPo} />
      ) : (
        <AdHocLines
          lines={adHocLines}
          rawMaterials={rawMaterials}
          rmById={rmById}
          add={addAdHoc}
          remove={removeAdHoc}
          update={updAdHoc}
        />
      )}

      {/* Challan / Invoice — bill level only. Per-line tax + discount
          live in the line-item table above. */}
      <div className="rounded-md border bg-card p-3 space-y-3">
        <div className="text-sm font-semibold">Bill-level charges (challan / invoice)</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <Label>Vendor invoice no</Label>
            <Input
              value={vendorInvoiceNo}
              onChange={(e) => setVendorInvoiceNo(e.target.value)}
              placeholder="e.g. INV-2026/0042"
            />
          </div>
          <div>
            <Label>Invoice date</Label>
            <Input
              type="date"
              value={vendorInvoiceDate}
              onChange={(e) => setVendorInvoiceDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Freight charges (₹)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={freightCharges}
              onChange={(e) => setFreightCharges(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label>Delivery charges (₹)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={deliveryCharges}
              onChange={(e) => setDeliveryCharges(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label>Other charges (₹)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={otherCharges}
              onChange={(e) => setOtherCharges(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Per-item rate, tax %, and discount go on each line above. Bill-level
          freight, delivery + other charges apportion across the lines by
          ₹-weight so each batch's landed rate reflects its true cost.
        </p>
      </div>

      {/* Notes */}
      <div>
        <Label>Notes (optional)</Label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. driver waited 20 min for security clearance"
        />
      </div>

      {/* Two buttons per the spec section 3 decision branch:
          ALL ITEMS RECEIVED? → Close PO & Save GRN
          NO + more expected → Keep PO open & Save GRN
          The SM picks the path on receipt. The ad-hoc case ignores
          keepOpen since there's no PO to keep open. */}
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t">
        {poId && (
          <Button
            onClick={() => submit(true)}
            disabled={pending}
            variant="outline"
            size="lg"
          >
            <Truck className="h-4 w-4" />
            {pending ? "Saving…" : "Keep PO open & save GRN"}
          </Button>
        )}
        <Button onClick={() => submit(false)} disabled={pending} size="lg">
          <Truck className="h-4 w-4" />
          {pending ? "Saving…" : poId ? "Close PO & save GRN" : "Save GRN & move stock"}
        </Button>
      </div>
    </div>
  );
}

function PoLines({
  lines,
  state,
  update,
}: {
  lines: PoLine[];
  state: Record<string, {
    qtyReceived: string;
    qtyDamaged: string;
    batchNo: string;
    note: string;
    taxRate: string;
    lineDiscount: string;
  }>;
  update: (id: string, patch: any) => void;
}) {
  return (
    <div>
      <Label>Receipt against PO</Label>
      <div className="rounded-md border overflow-x-auto mt-1">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-2">Item</th>
              <th className="text-right p-2 w-20">Ordered</th>
              <th className="text-right p-2 w-20">Already</th>
              <th className="text-right p-2 w-24">Receiving</th>
              <th className="text-right p-2 w-20">Damaged</th>
              <th className="text-right p-2 w-20">Rate (₹)</th>
              <th className="text-right p-2 w-16">Tax %</th>
              <th className="text-right p-2 w-20">Disc (₹)</th>
              <th className="text-right p-2 w-24">Line total</th>
              <th className="text-left p-2 w-32">Batch</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const r = state[l.id];
              const pending = Math.max(0, l.qtyOrdered - l.qtyAlreadyReceived);
              const receivingNow = Number(r?.qtyReceived) || 0;
              const overshoot = receivingNow > pending;
              return (
                <tr key={l.id} className="border-t">
                  <td className="p-2 font-medium">{l.name}</td>
                  <td className="p-2 text-right">
                    {l.qtyOrdered} {l.unit}
                  </td>
                  <td className="p-2 text-right text-xs text-muted-foreground">
                    {l.qtyAlreadyReceived} {l.unit}
                  </td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={r?.qtyReceived ?? ""}
                      onChange={(e) => update(l.id, { qtyReceived: e.target.value })}
                      className={`h-8 w-24 text-right ml-auto ${overshoot ? "border-amber-400" : ""}`}
                    />
                    {overshoot && (
                      <div className="text-[10px] text-amber-700 mt-0.5">
                        Over expected ({pending} pending)
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={r?.qtyDamaged ?? ""}
                      onChange={(e) => update(l.id, { qtyDamaged: e.target.value })}
                      className="h-8 w-20 text-right ml-auto"
                    />
                  </td>
                  <td className="p-2 text-right text-xs text-muted-foreground">
                    {inr2(l.unitPrice)}
                  </td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={r?.taxRate ?? ""}
                      onChange={(e) => update(l.id, { taxRate: e.target.value })}
                      placeholder="0"
                      className="h-8 w-16 text-right ml-auto"
                    />
                  </td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={r?.lineDiscount ?? ""}
                      onChange={(e) => update(l.id, { lineDiscount: e.target.value })}
                      placeholder="0"
                      className="h-8 w-20 text-right ml-auto"
                    />
                  </td>
                  <td className="p-2 text-right text-xs tabular-nums">
                    {(() => {
                      const qty = Number(r?.qtyReceived) || 0;
                      const rate = l.unitPrice;
                      const tax = qty * rate * (Number(r?.taxRate) || 0) / 100;
                      const disc = Number(r?.lineDiscount) || 0;
                      const total = qty * rate + tax - disc;
                      return total > 0 ? inr2(total) : "—";
                    })()}
                  </td>
                  <td className="p-2">
                    <Input
                      value={r?.batchNo ?? ""}
                      onChange={(e) => update(l.id, { batchNo: e.target.value })}
                      placeholder="Batch #"
                      className="h-8"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdHocLines({
  lines,
  rawMaterials,
  rmById,
  add,
  remove,
  update,
}: {
  lines: AdHocLine[];
  rawMaterials: Rm[];
  rmById: Map<string, Rm>;
  add: () => void;
  remove: (key: string) => void;
  update: (key: string, patch: Partial<AdHocLine>) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label>Items received</Label>
        <Button type="button" variant="ghost" size="sm" onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Add line
        </Button>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-2">Raw material</th>
              <th className="text-right p-2 w-24">Qty</th>
              <th className="text-right p-2 w-24">Rate (₹)</th>
              <th className="text-right p-2 w-16">Tax %</th>
              <th className="text-right p-2 w-20">Disc (₹)</th>
              <th className="text-right p-2 w-24">Line total</th>
              <th className="text-left p-2">Note</th>
              <th className="text-right p-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const rm = l.rawMaterialId ? rmById.get(l.rawMaterialId) : null;
              return (
                <tr key={l.key} className="border-t">
                  <td className="p-2">
                    <select
                      value={l.rawMaterialId}
                      onChange={(e) => update(l.key, { rawMaterialId: e.target.value })}
                      className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                    >
                      <option value="">Pick item…</option>
                      {rawMaterials.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={l.qtyReceived}
                      onChange={(e) => update(l.key, { qtyReceived: e.target.value })}
                      className="h-8 w-24 text-right ml-auto"
                    />
                    {rm && <div className="text-[10px] text-muted-foreground mt-0.5">{rm.unit}</div>}
                  </td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={l.unitCost}
                      onChange={(e) => update(l.key, { unitCost: e.target.value })}
                      placeholder={rm ? String(rm.avgCost) : "0"}
                      className="h-8 w-24 text-right ml-auto"
                    />
                  </td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={l.taxRate}
                      onChange={(e) => update(l.key, { taxRate: e.target.value })}
                      placeholder="0"
                      className="h-8 w-16 text-right ml-auto"
                    />
                  </td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={l.lineDiscount}
                      onChange={(e) => update(l.key, { lineDiscount: e.target.value })}
                      placeholder="0"
                      className="h-8 w-20 text-right ml-auto"
                    />
                  </td>
                  <td className="p-2 text-right text-xs tabular-nums">
                    {(() => {
                      const qty = Number(l.qtyReceived) || 0;
                      const rate = Number(l.unitCost) || 0;
                      const tax = qty * rate * (Number(l.taxRate) || 0) / 100;
                      const disc = Number(l.lineDiscount) || 0;
                      const total = qty * rate + tax - disc;
                      return total > 0 ? inr2(total) : "—";
                    })()}
                  </td>
                  <td className="p-2">
                    <Input
                      value={l.note}
                      onChange={(e) => update(l.key, { note: e.target.value })}
                      placeholder="Optional"
                      className="h-8"
                    />
                  </td>
                  <td className="p-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(l.key)}
                      disabled={lines.length === 1}
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
  );
}
