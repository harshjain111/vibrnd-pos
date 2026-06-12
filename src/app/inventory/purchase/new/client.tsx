"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { inr } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import { createPO } from "../actions";

type Supplier = { id: string; name: string };
type Rm = { id: string; name: string; unit: string; avgCost: number; parLevel: number; currentQty: number };
type Line = { rawMaterialId: string; qty: number; unit: string; unitPrice: number };

export function PoBuilder({
  suppliers,
  rms,
  initialLines,
  requisitionId,
}: {
  suppliers: Supplier[];
  rms: Rm[];
  /** Lines pre-filled when ?req=<id> is set — the requisition's shortfall. */
  initialLines?: { rawMaterialId: string; qty: number; unit: string; unitPrice: number }[];
  /** When set, the PO is recorded with this parent requisition. */
  requisitionId?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [supplierId, setSupplierId] = React.useState<string>(suppliers[0]?.id ?? "");
  const [notes, setNotes] = React.useState(
    requisitionId ? "Covering shortfall against requisition" : ""
  );
  const [lines, setLines] = React.useState<Line[]>(initialLines ?? []);
  const [pending, startTransition] = React.useTransition();

  const rmById = (id: string) => rms.find((r) => r.id === id);

  const addLine = () => {
    const first = rms[0];
    if (!first) return;
    setLines((ls) => [...ls, { rawMaterialId: first.id, qty: 1, unit: first.unit, unitPrice: first.avgCost || 0 }]);
  };

  const upd = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const rm = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  // Suggest items below par level — quick-add chips
  const suggestions = rms
    .filter((r) => r.currentQty < r.parLevel && r.parLevel > 0)
    .filter((r) => !lines.some((l) => l.rawMaterialId === r.id))
    .slice(0, 6);

  const addSuggested = (r: Rm) => {
    const qty = Math.max(1, Math.ceil(r.parLevel - r.currentQty));
    setLines((ls) => [...ls, { rawMaterialId: r.id, qty, unit: r.unit, unitPrice: r.avgCost || 0 }]);
  };

  const total = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  const submit = () => {
    if (!supplierId) {
      toast({ variant: "destructive", title: "Pick a supplier first" });
      return;
    }
    if (lines.length === 0) {
      toast({ variant: "destructive", title: "Add at least one line" });
      return;
    }
    startTransition(async () => {
      try {
        const res = await createPO({
          supplierId,
          notes: notes || undefined,
          lines,
          requisitionId: requisitionId ?? undefined,
        });
        toast({ variant: "success", title: `Created ${res.poNo}`, description: "Status: DRAFT" });
        router.push(`/inventory/purchase/${res.id}`);
      } catch (e) {
        toast({ variant: "destructive", title: "Failed to create PO", description: String(e) });
      }
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Supplier</Label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery instructions, payment terms…" />
              </div>
            </div>
          </CardContent>
        </Card>

        {suggestions.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Auto-suggest — items below par level
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => addSuggested(r)}
                    className="text-xs rounded-full border border-primary/40 text-primary px-3 py-1 hover:bg-primary/10"
                  >
                    + {r.name}{" "}
                    <span className="text-muted-foreground">
                      ({r.currentQty.toFixed(1)} / par {r.parLevel} {r.unit})
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-medium">Lines</div>
            {lines.length === 0 ? (
              <div className="text-sm text-muted-foreground border-2 border-dashed rounded-md py-6 text-center">
                No lines yet. Add raw materials below.
              </div>
            ) : (
              <div className="space-y-2">
                {lines.map((l, i) => {
                  return (
                    <div key={i} className="grid grid-cols-[1fr_100px_80px_120px_auto] gap-2 items-center">
                      <select
                        value={l.rawMaterialId}
                        onChange={(e) => {
                          const r = rmById(e.target.value);
                          upd(i, {
                            rawMaterialId: e.target.value,
                            unit: r?.unit ?? l.unit,
                            unitPrice: r?.avgCost ?? l.unitPrice,
                          });
                        }}
                        className="h-9 rounded-md border bg-background px-3 text-sm"
                      >
                        {rms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.qty}
                        onChange={(e) => upd(i, { qty: Number(e.target.value) || 0 })}
                      />
                      <Input value={l.unit} onChange={(e) => upd(i, { unit: e.target.value })} />
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="pl-6"
                          value={l.unitPrice}
                          onChange={(e) => upd(i, { unitPrice: Number(e.target.value) || 0 })}
                        />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => rm(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            <Button variant="outline" size="sm" type="button" onClick={addLine}>
              <Plus className="h-4 w-4" />
              Add line
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-20 self-start">
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-medium">Summary</div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Lines</span>
            <span>{lines.length}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{inr(total)}</span>
          </div>
          <div className="flex items-center justify-between text-base font-semibold pt-2 border-t">
            <span>Grand total</span>
            <span>{inr(total)}</span>
          </div>
          <Button onClick={submit} disabled={lines.length === 0 || pending} className="w-full" size="lg">
            {pending ? "Saving…" : "Create as draft"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Drafts don't change stock. Mark <strong>Received</strong> on the next screen to update inventory.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
