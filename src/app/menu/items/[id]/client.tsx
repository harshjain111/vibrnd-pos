"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { saveVariants, saveAddons } from "../../actions";

type Variant = { id?: string; name: string; price: number };
type Addon = { id?: string; name: string; priceDelta: number };

export function VariantEditor({
  itemId,
  basePrice,
  initial,
}: {
  itemId: string;
  basePrice: number;
  initial: Variant[];
}) {
  const [rows, setRows] = React.useState<Variant[]>(initial);
  const [pending, startTransition] = React.useTransition();
  const [saved, setSaved] = React.useState(false);

  const addRow = () => setRows((r) => [...r, { name: "", price: basePrice }]);
  const upd = (i: number, patch: Partial<Variant>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const rm = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await saveVariants({ itemId, variants: rows.filter((v) => v.name.trim().length > 0) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground border-2 border-dashed rounded-md py-6 text-center">
          No variants. Item sells at base price <span className="font-medium text-foreground">₹{basePrice}</span>.
        </div>
      ) : (
        rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_140px_auto] gap-2">
            <Input
              placeholder="Variant name (e.g. Half)"
              value={row.name}
              onChange={(e) => upd(i, { name: e.target.value })}
            />
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="Price"
              value={row.price}
              onChange={(e) => upd(i, { price: Number(e.target.value) || 0 })}
            />
            <Button variant="ghost" size="icon" onClick={() => rm(i)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))
      )}

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4" />
          Add variant
        </Button>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save variants"}
        </Button>
        {saved && <span className="text-xs text-emerald-600">Saved ✓</span>}
      </div>
    </div>
  );
}

export function AddonEditor({ itemId, initial }: { itemId: string; initial: Addon[] }) {
  const [rows, setRows] = React.useState<Addon[]>(initial);
  const [pending, startTransition] = React.useTransition();
  const [saved, setSaved] = React.useState(false);

  const addRow = () => setRows((r) => [...r, { name: "", priceDelta: 0 }]);
  const upd = (i: number, patch: Partial<Addon>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const rm = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await saveAddons({ itemId, addons: rows.filter((a) => a.name.trim().length > 0) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground border-2 border-dashed rounded-md py-6 text-center">
          No addons. Customers can't add modifiers to this item.
        </div>
      ) : (
        rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_140px_auto] gap-2">
            <Input
              placeholder="Addon name (e.g. Extra cheese)"
              value={row.name}
              onChange={(e) => upd(i, { name: e.target.value })}
            />
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">+₹</span>
              <Input
                type="number"
                step="0.01"
                placeholder="0"
                className="pl-7"
                value={row.priceDelta}
                onChange={(e) => upd(i, { priceDelta: Number(e.target.value) || 0 })}
              />
            </div>
            <Button variant="ghost" size="icon" onClick={() => rm(i)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))
      )}

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4" />
          Add addon
        </Button>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save addons"}
        </Button>
        {saved && <span className="text-xs text-emerald-600">Saved ✓</span>}
      </div>
    </div>
  );
}
