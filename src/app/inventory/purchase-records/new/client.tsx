"use client";
import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { inr } from "@/lib/utils";
import { saveStockPurchase } from "../actions";

type Supplier = { id: string; name: string; gstin: string | null };
type RM = { id: string; name: string; unit: string; price: number; taxPct: number };

type Line = {
  rawMaterialId: string;
  qty: number;
  unit: string;
  price: number;
  discountType: "FLAT" | "PERCENT";
  discountValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  exciseDuty: number;
  batchNo: string;
  expiryDate: string;
  varianceReason: string;
};

function emptyLine(): Line {
  return {
    rawMaterialId: "",
    qty: 0,
    unit: "",
    price: 0,
    discountType: "FLAT",
    discountValue: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    exciseDuty: 0,
    batchNo: "",
    expiryDate: "",
    varianceReason: "",
  };
}

function calcLineAmount(l: Line): number {
  const base = l.qty * l.price;
  const disc = l.discountType === "PERCENT" ? (base * l.discountValue) / 100 : l.discountValue;
  const taxable = Math.max(0, base - disc);
  const tax = (taxable * (l.cgst + l.sgst + l.igst)) / 100 + l.exciseDuty * l.qty;
  return taxable + tax;
}

export function NewPurchaseForm({
  suppliers,
  rawMaterials,
  units,
  purchaseOrders,
}: {
  suppliers: Supplier[];
  rawMaterials: RM[];
  units: string[];
  purchaseOrders: { id: string; poNo: string }[];
}) {
  const { toast } = useToast();
  const [supplierId, setSupplierId] = React.useState<string>("");
  const [poId, setPoId] = React.useState<string>("");
  const [invoiceNo, setInvoiceNo] = React.useState<string>("");
  const [invoiceDate, setInvoiceDate] = React.useState<string>(new Date().toISOString().slice(0, 10));
  const [poReferenceNo, setPoReferenceNo] = React.useState<string>("");
  const [lines, setLines] = React.useState<Line[]>([emptyLine()]);
  const [otherCharges, setOtherCharges] = React.useState<number>(0);
  const [otherTaxes, setOtherTaxes] = React.useState<number>(0);
  const [paymentType, setPaymentType] = React.useState<"UNPAID" | "PAID" | "PARTIAL">("UNPAID");
  const [paymentMode, setPaymentMode] = React.useState<string>("CASH");
  const [amountPaid, setAmountPaid] = React.useState<number>(0);
  const [updateStock, setUpdateStock] = React.useState<boolean>(true);
  const [pending, startTransition] = React.useTransition();

  const rmMap = React.useMemo(() => new Map(rawMaterials.map((r) => [r.id, r])), [rawMaterials]);

  const subTotal = lines.reduce((s, l) => {
    const base = l.qty * l.price;
    const disc = l.discountType === "PERCENT" ? (base * l.discountValue) / 100 : l.discountValue;
    return s + Math.max(0, base - disc);
  }, 0);
  const totalDisc = lines.reduce((s, l) => {
    const base = l.qty * l.price;
    return s + (l.discountType === "PERCENT" ? (base * l.discountValue) / 100 : l.discountValue);
  }, 0);
  const totalTax = lines.reduce((s, l) => {
    const base = l.qty * l.price;
    const disc = l.discountType === "PERCENT" ? (base * l.discountValue) / 100 : l.discountValue;
    const taxable = Math.max(0, base - disc);
    return s + (taxable * (l.cgst + l.sgst + l.igst)) / 100 + l.exciseDuty * l.qty;
  }, 0);
  const grand = subTotal + totalTax + otherCharges + otherTaxes;

  const updateLine = (i: number, patch: Partial<Line>) => {
    setLines((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const onSelectRm = (i: number, rmId: string) => {
    const rm = rmMap.get(rmId);
    if (!rm) return updateLine(i, { rawMaterialId: rmId });
    // Split a flat tax % into CGST+SGST 50/50 by default
    const half = rm.taxPct / 2;
    updateLine(i, {
      rawMaterialId: rmId,
      unit: rm.unit,
      price: rm.price,
      cgst: half,
      sgst: half,
      igst: 0,
    });
  };

  const removeLine = (i: number) => {
    if (lines.length === 1) return;
    setLines((arr) => arr.filter((_, idx) => idx !== i));
  };

  const addLine = () => setLines((arr) => [...arr, emptyLine()]);

  // Variance flag per line
  const lineVariance = (l: Line) => {
    const rm = rmMap.get(l.rawMaterialId);
    if (!rm || rm.price === 0) return null;
    const diff = Math.abs(l.price - rm.price) / rm.price;
    return diff > 0.02 ? { standard: rm.price } : null;
  };

  const submit = () => {
    if (lines.some((l) => !l.rawMaterialId || l.qty <= 0)) {
      toast({ variant: "destructive", title: "Each line needs a raw material and qty > 0" });
      return;
    }
    // Check variance reasons
    for (const l of lines) {
      if (lineVariance(l) && !l.varianceReason.trim()) {
        toast({
          variant: "destructive",
          title: "Price variance reason required",
          description: `${rmMap.get(l.rawMaterialId)?.name} differs from standard. Add a reason on that line.`,
        });
        return;
      }
    }
    startTransition(async () => {
      try {
        await saveStockPurchase({
          invoiceNo: invoiceNo || undefined,
          invoiceDate,
          supplierId: supplierId || undefined,
          poId: poId || undefined,
          poReferenceNo: poReferenceNo || undefined,
          otherCharges,
          otherTaxes,
          paymentType,
          paymentMode: paymentType !== "UNPAID" ? paymentMode : undefined,
          amountPaid: paymentType === "PARTIAL" ? amountPaid : 0,
          updateStock,
          lines: lines.map((l) => ({
            rawMaterialId: l.rawMaterialId,
            qty: l.qty,
            unit: l.unit,
            price: l.price,
            discountType: l.discountType,
            discountValue: l.discountValue,
            cgst: l.cgst,
            sgst: l.sgst,
            igst: l.igst,
            exciseDuty: l.exciseDuty,
            batchNo: l.batchNo || undefined,
            expiryDate: l.expiryDate || undefined,
            varianceReason: l.varianceReason || undefined,
          })),
        });
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't save", description: String(e) });
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Header</CardTitle>
          <CardDescription>Who we bought from and which invoice this is.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Supplier</Label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">— Direct / no supplier —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.gstin ? ` · ${s.gstin}` : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Against PO (optional)</Label>
            <select value={poId} onChange={(e) => setPoId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">— None —</option>
              {purchaseOrders.map((p) => (
                <option key={p.id} value={p.id}>{p.poNo}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Invoice date</Label>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>
          <div>
            <Label>Invoice #</Label>
            <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="vendor ref" />
          </div>
          <div>
            <Label>PO reference (manual)</Label>
            <Input value={poReferenceNo} onChange={(e) => setPoReferenceNo(e.target.value)} placeholder="optional" />
          </div>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Lines</CardTitle>
          <CardDescription>One row per raw material received. Batch+expiry is optional but recommended for perishables.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((l, i) => {
            const variance = lineVariance(l);
            return (
              <div key={i} className="border rounded-md p-3 space-y-2 relative">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-12 md:col-span-4">
                    <Label className="text-xs">Raw material</Label>
                    <select
                      value={l.rawMaterialId}
                      onChange={(e) => onSelectRm(i, e.target.value)}
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="">— Select —</option>
                      {rawMaterials.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3 md:col-span-1">
                    <Label className="text-xs">Qty</Label>
                    <Input type="number" step="0.01" value={l.qty} onChange={(e) => updateLine(i, { qty: Number(e.target.value) || 0 })} className="h-9" />
                  </div>
                  <div className="col-span-3 md:col-span-1">
                    <Label className="text-xs">Unit</Label>
                    <select value={l.unit} onChange={(e) => updateLine(i, { unit: e.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                      <option value="">—</option>
                      {units.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3 md:col-span-1">
                    <Label className="text-xs">Price ₹</Label>
                    <Input type="number" step="0.01" value={l.price} onChange={(e) => updateLine(i, { price: Number(e.target.value) || 0 })} className="h-9" />
                  </div>
                  <div className="col-span-3 md:col-span-1">
                    <Label className="text-xs">Disc</Label>
                    <Input type="number" step="0.01" value={l.discountValue} onChange={(e) => updateLine(i, { discountValue: Number(e.target.value) || 0 })} className="h-9" />
                  </div>
                  <div className="col-span-3 md:col-span-1">
                    <Label className="text-xs">CGST %</Label>
                    <Input type="number" step="0.01" value={l.cgst} onChange={(e) => updateLine(i, { cgst: Number(e.target.value) || 0 })} className="h-9" />
                  </div>
                  <div className="col-span-3 md:col-span-1">
                    <Label className="text-xs">SGST %</Label>
                    <Input type="number" step="0.01" value={l.sgst} onChange={(e) => updateLine(i, { sgst: Number(e.target.value) || 0 })} className="h-9" />
                  </div>
                  <div className="col-span-3 md:col-span-1">
                    <Label className="text-xs">IGST %</Label>
                    <Input type="number" step="0.01" value={l.igst} onChange={(e) => updateLine(i, { igst: Number(e.target.value) || 0 })} className="h-9" />
                  </div>
                  <div className="col-span-3 md:col-span-1 flex items-end justify-end">
                    <div className="text-right">
                      <div className="text-[10px] uppercase text-muted-foreground">Amount</div>
                      <div className="font-semibold text-sm">{inr(Math.round(calcLineAmount(l)))}</div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-6 md:col-span-3">
                    <Label className="text-xs">Batch No</Label>
                    <Input value={l.batchNo} onChange={(e) => updateLine(i, { batchNo: e.target.value })} className="h-9" placeholder="optional" />
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <Label className="text-xs">Expiry</Label>
                    <Input type="date" value={l.expiryDate} onChange={(e) => updateLine(i, { expiryDate: e.target.value })} className="h-9" />
                  </div>
                  {variance && (
                    <div className="col-span-12 md:col-span-5">
                      <Label className="text-xs flex items-center gap-1 text-amber-700">
                        <AlertTriangle className="h-3 w-3" />
                        Price variance vs std ₹{variance.standard.toFixed(2)} — reason required
                      </Label>
                      <Input
                        value={l.varianceReason}
                        onChange={(e) => updateLine(i, { varianceReason: e.target.value })}
                        className="h-9"
                        placeholder="market price rose / contract update / …"
                      />
                    </div>
                  )}
                  <div className="col-span-12 md:col-span-1 flex items-end">
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(i)} className="text-rose-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="h-4 w-4" />
            Add line
          </Button>
        </CardContent>
      </Card>

      {/* Totals + Payment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Totals</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Sub total</span><span>{inr(subTotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total discount</span><span>−{inr(totalDisc)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax total</span><span>{inr(totalTax)}</span></div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Other charges</span>
              <Input type="number" step="1" value={otherCharges} onChange={(e) => setOtherCharges(Number(e.target.value) || 0)} className="h-7 w-24 text-right text-sm" />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Other taxes</span>
              <Input type="number" step="1" value={otherTaxes} onChange={(e) => setOtherTaxes(Number(e.target.value) || 0)} className="h-7 w-24 text-right text-sm" />
            </div>
            <div className="flex justify-between text-base font-semibold pt-1.5 border-t">
              <span>Grand total</span><span>{inr(Math.round(grand))}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Payment</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div>
              <Label>Type</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["UNPAID", "PAID", "PARTIAL"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setPaymentType(t)} className={`text-xs px-2 py-2 rounded border ${paymentType === t ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {paymentType !== "UNPAID" && (
              <>
                <div>
                  <Label>Mode</Label>
                  <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                    {["CASH", "CHEQUE", "NEFT", "UPI", "CARD"].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                {paymentType === "PARTIAL" && (
                  <div>
                    <Label>Amount paid now</Label>
                    <Input type="number" step="1" value={amountPaid} onChange={(e) => setAmountPaid(Number(e.target.value) || 0)} />
                  </div>
                )}
              </>
            )}
            <label className="flex items-center gap-2 text-sm pt-2">
              <input type="checkbox" checked={updateStock} onChange={(e) => setUpdateStock(e.target.checked)} />
              <span>Update Inventory Stock immediately</span>
              {updateStock && <Badge variant="success" className="text-[10px]">ON</Badge>}
            </label>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => history.back()}>Cancel</Button>
        <Button onClick={submit} disabled={pending}>
          {pending ? "Saving…" : `Save · ${inr(Math.round(grand))}`}
        </Button>
      </div>
    </div>
  );
}
