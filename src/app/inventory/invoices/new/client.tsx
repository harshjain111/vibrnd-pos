"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { FileText } from "lucide-react";
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

export function NewInvoiceForm({
  suppliers,
  initialSupplierId,
  initialGrnId,
  seedTotal,
  eligibleGrns,
}: {
  suppliers: Supplier[];
  initialSupplierId: string;
  initialGrnId: string | null;
  seedTotal: number;
  eligibleGrns: GrnOption[];
}) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [supplierId, setSupplierId] = React.useState(initialSupplierId);
  const [invoiceNo, setInvoiceNo] = React.useState("");
  const [invoiceDate, setInvoiceDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [subTotal, setSubTotal] = React.useState(seedTotal ? String(seedTotal) : "");
  const [taxTotal, setTaxTotal] = React.useState("");
  const [grandTotal, setGrandTotal] = React.useState(seedTotal ? String(seedTotal) : "");
  const [fileUrl, setFileUrl] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [selectedGrns, setSelectedGrns] = React.useState<Set<string>>(
    new Set(initialGrnId ? [initialGrnId] : [])
  );

  const toggleGrn = (id: string) =>
    setSelectedGrns((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // When user changes supplier, show only matching GRNs (or ad-hoc).
  const visibleGrns = supplierId
    ? eligibleGrns.filter((g) => !g.supplierId || g.supplierId === supplierId)
    : eligibleGrns;

  const submit = () => {
    if (!supplierId) return toast({ variant: "destructive", title: "Pick a supplier" });
    if (!invoiceNo.trim()) return toast({ variant: "destructive", title: "Invoice # required" });
    if (selectedGrns.size === 0) return toast({ variant: "destructive", title: "Link at least one GRN" });
    const grand = Number(grandTotal);
    if (!grand || grand <= 0) return toast({ variant: "destructive", title: "Grand total must be > 0" });

    startTransition(async () => {
      try {
        await createVendorInvoice({
          supplierId,
          invoiceNo: invoiceNo.trim(),
          invoiceDate,
          subTotal: Number(subTotal) || 0,
          taxTotal: Number(taxTotal) || 0,
          grandTotal: grand,
          fileUrl: fileUrl || undefined,
          notes: notes || undefined,
          grnLinks: Array.from(selectedGrns).map((id) => ({ grnId: id, amount: 0 })),
        });
        // server redirects to detail
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't save invoice", description: String(e) });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
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
          <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="e.g. INV/2026-06/12345" />
        </div>
        <div>
          <Label>Invoice date</Label>
          <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        </div>
        <div>
          <Label>Sub total (₹)</Label>
          <Input type="number" min="0" step="0.01" value={subTotal} onChange={(e) => setSubTotal(e.target.value)} />
        </div>
        <div>
          <Label>Tax total (₹)</Label>
          <Input type="number" min="0" step="0.01" value={taxTotal} onChange={(e) => setTaxTotal(e.target.value)} />
        </div>
        <div>
          <Label>Grand total (₹)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={grandTotal}
            onChange={(e) => setGrandTotal(e.target.value)}
            className="font-semibold"
          />
        </div>
      </div>

      {/* GRN selector */}
      <div>
        <Label>Link GRNs covered by this invoice</Label>
        <div className="rounded-md border max-h-64 overflow-y-auto mt-1">
          {visibleGrns.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No matching GRNs. Save the GRN first or pick a different supplier.
            </div>
          ) : (
            <ul className="divide-y">
              {visibleGrns.map((g) => {
                const checked = selectedGrns.has(g.id);
                return (
                  <li
                    key={g.id}
                    className={`flex items-center gap-3 p-2 cursor-pointer transition-colors ${checked ? "bg-primary/5" : "hover:bg-accent/40"}`}
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
                        {g.poNo ? `Against PO ${g.poNo}` : <Badge variant="warning" className="text-[9px]">Ad-hoc</Badge>}
                        {" · "}
                        {new Date(g.receivedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                      </div>
                    </div>
                    <div className="text-sm font-medium text-right shrink-0">{inr(g.value)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

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
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any reference / PO# etc." />
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
