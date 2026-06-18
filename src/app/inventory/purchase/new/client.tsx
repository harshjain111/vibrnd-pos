"use client";
/**
 * New PO client — cart-style flow per spec section 2.
 *
 *   Empty cart
 *   └─ "Add line item" button opens a picker modal
 *      • Search the catalog (typed name or category)
 *      • Each item row shows: name, current stock, min/par
 *      • Click → expands to show supplier list with rate-card prices
 *      • Pick a supplier, set qty → "Add to PO"
 *   Lines accumulate in the cart; supplier / qty / rate stay editable
 *   inline. The card at the bottom previews the supplier grouping in
 *   real time ("4 items will create 2 POs") so the SM knows what the
 *   server will produce before submitting.
 *
 * Submit → createAutoPosByGrouping → N POs straight to CC for approval,
 * sharing a batchKey.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import Link from "next/link";
import { Plus, Search, Trash2, ShoppingBag, ChevronRight, AlertTriangle, Check } from "lucide-react";
import { createAutoPosByGrouping } from "../actions";
import { inr } from "@/lib/utils";

type Supplier = { id: string; name: string };
type RatedSupplier = { supplierId: string; supplierName: string; ratePerUnit: number };
type Item = {
  id: string;
  name: string;
  unit: string;
  categoryName: string | null;
  currentQty: number;
  minLevel: number;
  parLevel: number;
  avgCost: number;
  purchasePrice: number;
  ratedSuppliers: RatedSupplier[];
  defaultSupplierId: string | null;
};

type Line = {
  key: string;
  item: Item;
  qty: number;
  supplierId: string;
  unitPrice: number;
};

function defaultRateFor(item: Item, supplierId: string): number {
  const rated = item.ratedSuppliers.find((s) => s.supplierId === supplierId);
  if (rated) return rated.ratePerUnit;
  if (item.purchasePrice > 0) return item.purchasePrice;
  return item.avgCost;
}

function defaultSupplierFor(item: Item): string {
  return (
    item.ratedSuppliers.find((s) => s.supplierId === item.defaultSupplierId)?.supplierId ??
    item.ratedSuppliers[0]?.supplierId ??
    ""
  );
}

export function NewPoClient({
  items,
  suppliers,
  prefillLines,
}: {
  items: Item[];
  suppliers: Supplier[];
  prefillLines: { rawMaterialId: string; qty: number }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [notes, setNotes] = React.useState("");

  const [lines, setLines] = React.useState<Line[]>(() => {
    const seeded: Line[] = [];
    for (const p of prefillLines) {
      const it = items.find((i) => i.id === p.rawMaterialId);
      if (!it) continue;
      const supplierId = defaultSupplierFor(it);
      seeded.push({
        key: `seed-${seeded.length}`,
        item: it,
        qty: p.qty,
        supplierId,
        unitPrice: defaultRateFor(it, supplierId),
      });
    }
    return seeded;
  });

  const [pickerOpen, setPickerOpen] = React.useState(false);

  const addLine = (item: Item, supplierId: string, qty: number) => {
    setLines((prev) => [
      ...prev,
      {
        key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        item,
        qty,
        supplierId,
        unitPrice: defaultRateFor(item, supplierId),
      },
    ]);
    setPickerOpen(false);
  };

  const updateLine = (key: string, patch: Partial<Line>) => {
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? {
              ...l,
              ...patch,
              // When the supplier changes, snap the rate to that
              // supplier's rate-card price (the SM can override
              // afterwards).
              ...(patch.supplierId && patch.supplierId !== l.supplierId
                ? { unitPrice: defaultRateFor(l.item, patch.supplierId) }
                : {}),
            }
          : l
      )
    );
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  // Live grouping preview.
  const grouping = React.useMemo(() => {
    const bySupplier = new Map<string, { name: string; lines: number; total: number }>();
    for (const l of lines) {
      if (!l.supplierId || l.qty <= 0) continue;
      const name =
        suppliers.find((s) => s.id === l.supplierId)?.name ??
        l.item.ratedSuppliers.find((s) => s.supplierId === l.supplierId)?.supplierName ??
        "?";
      const entry = bySupplier.get(l.supplierId) ?? { name, lines: 0, total: 0 };
      entry.lines += 1;
      entry.total += l.qty * l.unitPrice;
      bySupplier.set(l.supplierId, entry);
    }
    return bySupplier;
  }, [lines, suppliers]);

  const submit = () => {
    const payload: { rawMaterialId: string; supplierId: string; qty: number; unit: string; unitPrice: number; offCard: boolean }[] = [];
    for (const l of lines) {
      if (l.qty <= 0 || !l.supplierId) continue;
      const onCard = l.item.ratedSuppliers.some((s) => s.supplierId === l.supplierId);
      payload.push({
        rawMaterialId: l.item.id,
        supplierId: l.supplierId,
        qty: l.qty,
        unit: l.item.unit,
        unitPrice: l.unitPrice,
        offCard: !onCard,
      });
    }
    if (payload.length === 0) {
      toast({
        variant: "destructive",
        title: "Cart is empty",
        description: "Add at least one line item with a supplier and qty.",
      });
      return;
    }

    startTransition(async () => {
      try {
        const res = await createAutoPosByGrouping({ lines: payload, notes: notes || undefined });
        const summary = res.pos
          .map((p) => `${p.poNo} · ${p.supplierName} · ${inr(p.total)}`)
          .join("\n");
        toast({
          variant: "success",
          title:
            res.status === "PENDING_CC_APPROVAL"
              ? `${res.pos.length} PO${res.pos.length === 1 ? "" : "s"} submitted to CC for approval`
              : `${res.pos.length} PO${res.pos.length === 1 ? "" : "s"} created · approved`,
          description: summary,
        });
        router.push(`/inventory/purchase?batch=${encodeURIComponent(res.batchKey)}`);
        router.refresh();
      } catch (e: any) {
        toast({ variant: "destructive", title: "Couldn't create POs", description: e?.message ?? String(e) });
      }
    });
  };

  return (
    <div className="space-y-3">
      {/* Cart */}
      <Card>
        <CardContent className="p-0">
          {lines.length === 0 ? (
            <div className="p-8 text-center">
              <ShoppingBag className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <div className="text-sm font-medium">No items yet</div>
              <div className="text-xs text-muted-foreground mt-1 mb-3">
                Add raw materials one at a time. Each pick shows current stock and the supplier rate card.
              </div>
              <Button onClick={() => setPickerOpen(true)} size="sm">
                <Plus className="h-4 w-4" /> Add line item
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right w-24">Qty</TableHead>
                    <TableHead className="w-48">Supplier</TableHead>
                    <TableHead className="text-right w-24">Rate (₹)</TableHead>
                    <TableHead className="text-right w-24">Line ₹</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => {
                    const lineTotal = l.qty * l.unitPrice;
                    const belowMin = l.item.currentQty < l.item.minLevel;
                    return (
                      <TableRow key={l.key}>
                        <TableCell>
                          <div className="font-medium text-sm">{l.item.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {l.item.categoryName ?? ""}
                            {l.item.categoryName ? " · " : ""}
                            min {l.item.minLevel} / par {l.item.parLevel} {l.item.unit}
                          </div>
                        </TableCell>
                        <TableCell className={"text-right tabular-nums text-xs " + (belowMin ? "text-rose-700 font-semibold" : "text-muted-foreground")}>
                          {l.item.currentQty} {l.item.unit}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={l.qty}
                            onChange={(e) => updateLine(l.key, { qty: Number(e.target.value) || 0 })}
                            className="h-8 text-sm text-right"
                          />
                        </TableCell>
                        <TableCell>
                          {l.item.ratedSuppliers.length > 0 ? (
                            <select
                              value={l.supplierId}
                              onChange={(e) => updateLine(l.key, { supplierId: e.target.value })}
                              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                            >
                              {l.item.ratedSuppliers.map((s) => (
                                <option key={s.supplierId} value={s.supplierId}>
                                  {s.supplierName} · ₹{s.ratePerUnit}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[11px] text-amber-700">No rate card</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={l.unitPrice}
                            onChange={(e) => updateLine(l.key, { unitPrice: Number(e.target.value) || 0 })}
                            className="h-8 text-sm text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">
                          {lineTotal > 0 ? inr(Math.round(lineTotal)) : "—"}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => removeLine(l.key)}
                            className="text-muted-foreground hover:text-destructive"
                            title="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="p-3 border-t flex items-center justify-between">
                <Button onClick={() => setPickerOpen(true)} variant="outline" size="sm">
                  <Plus className="h-4 w-4" /> Add another item
                </Button>
                <div className="text-xs text-muted-foreground">
                  {lines.length} line{lines.length === 1 ? "" : "s"}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live grouping preview */}
      {lines.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3">
            <div className="text-sm font-semibold text-primary mb-2 inline-flex items-center gap-1.5">
              {grouping.size > 0
                ? `Will create ${grouping.size} PO${grouping.size === 1 ? "" : "s"} and send for CC approval`
                : "Pick a supplier for every line to preview the grouping"}
            </div>
            {grouping.size > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {Array.from(grouping.entries()).map(([id, s]) => (
                  <div key={id} className="rounded-md border bg-card p-2 text-sm flex items-center justify-between">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {s.lines} line{s.lines === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{inr(Math.round(s.total))}</div>
                      <div className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                        TO CC <ChevronRight className="h-3 w-3" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notes + submit */}
      {lines.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 pt-1">
          <div className="flex-1 min-w-[280px]">
            <Label>Notes (optional, applied to every PO)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. urgent — needed by Friday morning"
            />
          </div>
          <Button onClick={submit} disabled={pending || grouping.size === 0} size="lg">
            {pending
              ? "Submitting…"
              : `Submit ${grouping.size || 0} PO${grouping.size === 1 ? "" : "s"} for CC approval`}
          </Button>
        </div>
      )}

      {/* Item picker dialog */}
      <ItemPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        items={items}
        suppliers={suppliers}
        onAdd={addLine}
      />
    </div>
  );
}

function ItemPicker({
  open,
  onClose,
  items,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  items: Item[];
  // suppliers list intentionally dropped — picker only surfaces
  // rate-card vendors per item.
  suppliers: Supplier[];
  onAdd: (item: Item, supplierId: string, qty: number) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [onlyBelowMin, setOnlyBelowMin] = React.useState(false);
  const [pickedId, setPickedId] = React.useState<string | null>(null);
  /** Per-supplier qty state for the picked item — keyed by supplierId so
   *  the user can edit different qtys side-by-side and click Add on the
   *  cheapest one without resetting their typing. */
  const [supplierQty, setSupplierQty] = React.useState<Record<string, string>>({});
  /** Recently-added chips at the top of the dialog so the SM can see
   *  what they've put into the cart on this burst. Resets each time the
   *  dialog reopens. */
  const [recent, setRecent] = React.useState<{ name: string; qty: number; unit: string; supplierName: string }[]>([]);

  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Reset on each open so a fresh entry session starts clean.
  React.useEffect(() => {
    if (open) {
      setSearch("");
      setPickedId(null);
      setSupplierQty({});
      setRecent([]);
      // Defer focus so the Radix Dialog has mounted before we grab it.
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (onlyBelowMin && it.currentQty >= it.minLevel) return false;
      if (q && !it.name.toLowerCase().includes(q) && !(it.categoryName ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, onlyBelowMin]);

  const picked = pickedId ? items.find((i) => i.id === pickedId) : null;

  const pick = (it: Item) => {
    setPickedId(it.id);
    // Pre-fill every rate-card supplier's qty with the suggested
    // (par − stock) so the SM just clicks "Add" on the cheapest one
    // without having to type anything for the common path.
    const suggested = Math.max(0, it.parLevel - it.currentQty);
    const initial: Record<string, string> = {};
    for (const s of it.ratedSuppliers) {
      initial[s.supplierId] = suggested > 0 ? String(suggested) : "1";
    }
    setSupplierQty(initial);
  };

  const addWith = (supplierId: string, supplierName: string, rate: number) => {
    if (!picked) return;
    const q = Number(supplierQty[supplierId]);
    if (!Number.isFinite(q) || q <= 0) return;
    onAdd(picked, supplierId, q);
    setRecent((prev) => [
      { name: picked.name, qty: q, unit: picked.unit, supplierName },
      ...prev,
    ].slice(0, 6));
    // Reset picked state + qtys + search so the SM is one keystroke
    // away from the next item. Search input stays focused so they
    // can type immediately.
    setPickedId(null);
    setSupplierQty({});
    setSearch("");
    searchInputRef.current?.focus();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add line items</DialogTitle>
        </DialogHeader>

        {/* Recently-added chips — gives the SM a quick "yep that went
            in" signal so they don't get lost during a 50-item burst. */}
        {recent.length > 0 && (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="text-muted-foreground inline-flex items-center gap-0.5 px-1">
              <Check className="h-3 w-3 text-emerald-600" /> Added:
            </span>
            {recent.map((r, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 px-2 py-0.5"
              >
                {r.name} · {r.qty} {r.unit} · {r.supplierName}
              </span>
            ))}
          </div>
        )}

        {/* Search bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to filter the catalog…"
              className="pl-7"
            />
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyBelowMin}
              onChange={(e) => setOnlyBelowMin(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
            Only below min
          </label>
        </div>

        {/* Item list. Clicking a row expands it inline to reveal the
            rate-card suppliers + per-supplier qty + Add button. */}
        <div className="border rounded-md overflow-y-auto flex-1" style={{ maxHeight: "55vh" }}>
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No matches.</div>
          ) : (
            <ul className="divide-y">
              {filtered.map((it) => {
                const isPicked = it.id === pickedId;
                const belowMin = it.currentQty < it.minLevel;
                const suggested = Math.max(0, it.parLevel - it.currentQty);
                const hasRateCard = it.ratedSuppliers.length > 0;
                return (
                  <li key={it.id} className={isPicked ? "bg-primary/5" : ""}>
                    {/* Header row — click to expand / collapse */}
                    <button
                      type="button"
                      onClick={() => pick(it)}
                      className="w-full text-left px-3 py-2 hover:bg-accent/40 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{it.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {it.categoryName ? `${it.categoryName} · ` : ""}
                            min {it.minLevel} / par {it.parLevel} {it.unit}
                            {hasRateCard
                              ? ` · ${it.ratedSuppliers.length} rate-card supplier${it.ratedSuppliers.length === 1 ? "" : "s"}`
                              : " · no rate card"}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={"text-sm font-semibold tabular-nums " + (belowMin ? "text-rose-700" : "")}>
                            {it.currentQty} {it.unit}
                          </div>
                          {suggested > 0 && (
                            <div className="text-[10px] text-amber-700">
                              order {suggested.toFixed(2)} {it.unit}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Expanded supplier rows — only shown for the picked
                        item. Cheapest first (already sorted server-side).
                        Each row is a tiny form: qty input + Add button.
                        Hitting Enter on the qty input submits that row. */}
                    {isPicked && (
                      <div className="px-3 pb-3 space-y-1.5">
                        {!hasRateCard ? (
                          <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-2">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-700 mt-0.5 shrink-0" />
                            <div className="flex-1">
                              <div className="font-medium">No suppliers on the rate card for this item.</div>
                              <div className="mt-0.5">
                                Add this item to a supplier&apos;s rate card before raising a PO.{" "}
                                <Link
                                  href="/inventory/suppliers"
                                  className="underline underline-offset-2 font-medium"
                                >
                                  Open Suppliers →
                                </Link>
                              </div>
                            </div>
                          </div>
                        ) : (
                          it.ratedSuppliers.map((s, idx) => {
                            const isCheapest = idx === 0; // server orders by negotiatedRate asc
                            const q = supplierQty[s.supplierId] ?? "";
                            const qNum = Number(q);
                            const lineTotal = Number.isFinite(qNum) && qNum > 0 ? qNum * s.ratePerUnit : 0;
                            return (
                              <div
                                key={s.supplierId}
                                className={
                                  "flex items-center gap-2 rounded-md border bg-card p-2 " +
                                  (isCheapest ? "border-emerald-300 bg-emerald-50/40" : "")
                                }
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium flex items-center gap-1.5">
                                    {s.supplierName}
                                    {isCheapest && (
                                      <span className="text-[9px] uppercase tracking-wider font-semibold text-emerald-700 bg-emerald-100 rounded px-1 py-0.5">
                                        Cheapest
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground tabular-nums">
                                    ₹{s.ratePerUnit} / {it.unit}
                                    {lineTotal > 0 && ` · line ₹${Math.round(lineTotal)}`}
                                  </div>
                                </div>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={q}
                                  onChange={(e) =>
                                    setSupplierQty((prev) => ({ ...prev, [s.supplierId]: e.target.value }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      addWith(s.supplierId, s.supplierName, s.ratePerUnit);
                                    }
                                  }}
                                  placeholder="qty"
                                  className="h-8 w-20 text-sm text-right tabular-nums"
                                  autoFocus={isCheapest}
                                />
                                <Button
                                  size="sm"
                                  onClick={() => addWith(s.supplierId, s.supplierName, s.ratePerUnit)}
                                  disabled={!qNum || qNum <= 0}
                                  className="h-8"
                                >
                                  <Plus className="h-3.5 w-3.5" /> Add
                                </Button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-[11px] text-muted-foreground">
            Tip: type to filter · click an item · press <kbd className="px-1 py-0.5 border rounded text-[10px]">Enter</kbd> on a qty to add quickly
          </div>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
