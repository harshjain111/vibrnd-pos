"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { ChevronRight, AlertTriangle, Filter, Search } from "lucide-react";
import { createAutoPosByGrouping } from "../actions";
import { inr } from "@/lib/utils";

type Supplier = { id: string; name: string };
type RatedSupplier = { supplierId: string; supplierName: string; ratePerUnit: number; onCard: true };
type Item = {
  id: string;
  name: string;
  unit: string;
  categoryName: string | null;
  currentQty: number;
  minLevel: number;
  parLevel: number;
  suggested: number;
  reorderTrigger: boolean;
  avgCost: number;
  purchasePrice: number;
  ratedSuppliers: RatedSupplier[];
  defaultSupplierId: string | null;
};

type Row = {
  picked: boolean;
  qty: string;
  supplierId: string;
  unitPrice: string;
};

export function AutoPoClient({ items, suppliers }: { items: Item[]; suppliers: Supplier[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [search, setSearch] = React.useState("");
  const [onlyBelowMin, setOnlyBelowMin] = React.useState(false);
  const [notes, setNotes] = React.useState("");

  // Per-row state keyed by RM id. Each row stores its picked flag + qty
  // + chosen supplier + rate so the user can tweak each without losing
  // sibling state.
  const [rows, setRows] = React.useState<Record<string, Row>>(() => {
    const initial: Record<string, Row> = {};
    for (const it of items) {
      const defaultSupplier =
        it.ratedSuppliers.find((s) => s.supplierId === it.defaultSupplierId) ??
        it.ratedSuppliers[0] ??
        null;
      initial[it.id] = {
        picked: false,
        qty: it.suggested > 0 ? String(it.suggested) : "",
        supplierId: defaultSupplier?.supplierId ?? "",
        unitPrice: defaultSupplier
          ? String(defaultSupplier.ratePerUnit)
          : it.purchasePrice
          ? String(it.purchasePrice)
          : it.avgCost
          ? String(it.avgCost)
          : "",
      };
    }
    return initial;
  });

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (onlyBelowMin && !it.reorderTrigger) return false;
      if (q && !it.name.toLowerCase().includes(q) && !(it.categoryName ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, onlyBelowMin]);

  // Summary row totals — how many rows picked + grouped supplier preview.
  const summary = React.useMemo(() => {
    let count = 0;
    const bySupplier = new Map<string, { name: string; lines: number; total: number }>();
    for (const it of items) {
      const r = rows[it.id];
      if (!r?.picked) continue;
      const qty = Number(r.qty) || 0;
      const rate = Number(r.unitPrice) || 0;
      if (qty <= 0 || !r.supplierId) continue;
      count += 1;
      const supplierName =
        it.ratedSuppliers.find((s) => s.supplierId === r.supplierId)?.supplierName ??
        suppliers.find((s) => s.id === r.supplierId)?.name ??
        "?";
      const entry = bySupplier.get(r.supplierId) ?? { name: supplierName, lines: 0, total: 0 };
      entry.lines += 1;
      entry.total += qty * rate;
      bySupplier.set(r.supplierId, entry);
    }
    return { count, bySupplier };
  }, [items, rows, suppliers]);

  const updateRow = (id: string, patch: Partial<Row>) => {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  // When the user picks a different supplier, refresh the rate to that
  // supplier's rate-card price (if known) so the line total updates.
  const setSupplier = (item: Item, supplierId: string) => {
    const rated = item.ratedSuppliers.find((s) => s.supplierId === supplierId);
    updateRow(item.id, {
      supplierId,
      unitPrice: rated ? String(rated.ratePerUnit) : rows[item.id]?.unitPrice ?? "",
    });
  };

  const submit = () => {
    const payload: { rawMaterialId: string; supplierId: string; qty: number; unit: string; unitPrice: number; offCard: boolean }[] = [];
    for (const it of items) {
      const r = rows[it.id];
      if (!r?.picked) continue;
      const qty = Number(r.qty);
      const unitPrice = Number(r.unitPrice);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (!r.supplierId) continue;
      const onCard = it.ratedSuppliers.some((s) => s.supplierId === r.supplierId);
      payload.push({
        rawMaterialId: it.id,
        supplierId: r.supplierId,
        qty,
        unit: it.unit,
        unitPrice,
        offCard: !onCard,
      });
    }
    if (payload.length === 0) {
      toast({ variant: "destructive", title: "Nothing to order", description: "Pick at least one item with a qty + supplier." });
      return;
    }

    startTransition(async () => {
      try {
        const res = await createAutoPosByGrouping({ lines: payload, notes: notes || undefined });
        toast({
          variant: "success",
          title: `${res.pos.length} draft PO${res.pos.length === 1 ? "" : "s"} created`,
          description: res.pos.map((p) => `${p.poNo} · ${p.supplierName} · ${inr(p.total)}`).join("\n"),
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
      {/* Filter bar */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search item or category…"
              className="pl-7"
            />
          </div>
          <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={onlyBelowMin}
              onChange={(e) => setOnlyBelowMin(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
            Only below min level
          </label>
          <div className="text-xs text-muted-foreground">
            {filtered.length} of {items.length} items
          </div>
        </CardContent>
      </Card>

      {/* Matrix */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Min / Par</TableHead>
                  <TableHead className="text-right">Suggested</TableHead>
                  <TableHead className="text-right w-24">Qty</TableHead>
                  <TableHead className="w-48">Supplier</TableHead>
                  <TableHead className="text-right w-24">Rate (₹)</TableHead>
                  <TableHead className="text-right w-24">Line ₹</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((it) => {
                  const r = rows[it.id];
                  const lineTotal = (Number(r.qty) || 0) * (Number(r.unitPrice) || 0);
                  const ratedIds = new Set(it.ratedSuppliers.map((s) => s.supplierId));
                  return (
                    <TableRow key={it.id} className={r.picked ? "bg-primary/5" : ""}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={r.picked}
                          onChange={(e) => updateRow(it.id, { picked: e.target.checked })}
                          className="h-3.5 w-3.5"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{it.name}</div>
                        {it.categoryName && (
                          <div className="text-[10px] text-muted-foreground">{it.categoryName}</div>
                        )}
                      </TableCell>
                      <TableCell className={"text-right tabular-nums " + (it.reorderTrigger ? "text-rose-700 font-semibold" : "")}>
                        {it.currentQty} {it.unit}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                        {it.minLevel} / {it.parLevel}
                      </TableCell>
                      <TableCell className={"text-right tabular-nums " + (it.suggested > 0 ? "text-amber-700 font-medium" : "")}>
                        {it.suggested > 0 ? `${it.suggested.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={r.qty}
                          onChange={(e) => updateRow(it.id, { qty: e.target.value })}
                          className="h-8 text-sm text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          value={r.supplierId}
                          onChange={(e) => setSupplier(it, e.target.value)}
                          className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                        >
                          <option value="">Pick supplier…</option>
                          {/* Rate-card suppliers first, with their rate inline */}
                          {it.ratedSuppliers.length > 0 && (
                            <optgroup label="Rate card">
                              {it.ratedSuppliers.map((s) => (
                                <option key={s.supplierId} value={s.supplierId}>
                                  {s.supplierName} · ₹{s.ratePerUnit}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {/* Fallback list of every other supplier — off-card */}
                          <optgroup label="Off card">
                            {suppliers
                              .filter((s) => !ratedIds.has(s.id))
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                          </optgroup>
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={r.unitPrice}
                          onChange={(e) => updateRow(it.id, { unitPrice: e.target.value })}
                          className="h-8 text-sm text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {lineTotal > 0 ? inr(Math.round(lineTotal)) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Live grouping preview */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-primary inline-flex items-center gap-1.5">
              <Filter className="h-4 w-4" />
              {summary.count > 0 ? `${summary.count} item${summary.count === 1 ? "" : "s"} picked` : "Pick items above to preview the grouping"}
              {summary.bySupplier.size > 0 && (
                <span className="font-normal text-muted-foreground"> · will create {summary.bySupplier.size} PO{summary.bySupplier.size === 1 ? "" : "s"}</span>
              )}
            </div>
          </div>
          {summary.bySupplier.size > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {Array.from(summary.bySupplier.entries()).map(([id, s]) => (
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
                      DRAFT <ChevronRight className="h-3 w-3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes + submit */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[280px]">
          <Label>Notes (optional, applied to every PO)</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. urgent — needed by Friday morning"
          />
        </div>
        <Button onClick={submit} disabled={pending || summary.count === 0} size="lg">
          {pending ? "Creating drafts…" : `Create ${summary.bySupplier.size || 0} draft PO${summary.bySupplier.size === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}
