"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Trash2, Plus, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { saveRecipe } from "../actions";

type Rm = { id: string; name: string; unit: string; avgCost: number };
type Variant = { id: string; name: string; price: number };
type Addon = { id: string; name: string; priceDelta: number };
type ItemOption = { id: string; name: string; variants: Variant[]; addons: Addon[] };
type Line = { rawMaterialId: string; qty: number; unit: string };
type AddonGroup = { addonId: string; ingredients: Line[] };
type Initial = {
  itemId: string;
  itemVariantId: string;
  base: Line[];
  addons: AddonGroup[];
};

function newLine(rms: Rm[]): Line {
  const first = rms[0];
  return {
    rawMaterialId: first?.id ?? "",
    qty: 0.1,
    unit: first?.unit ?? "kg",
  };
}

/**
 * Recipe editor — used for both Set/Edit (locked item+variant) and
 * "+ New recipe" (open item + variant pickers). The popup is one piece
 * shared between the two flows per the user spec.
 */
export function RecipeEditor({
  children,
  items,
  rms,
  initial,
  lockSelection = false,
}: {
  children: React.ReactNode;
  items: ItemOption[];
  rms: Rm[];
  initial: Initial;
  /** True when launched from a row's Set/Edit button — item + variant
   *  pickers are read-only. Default false for the "+ New recipe" flow. */
  lockSelection?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [itemId, setItemId] = React.useState(initial.itemId);
  const [variantId, setVariantId] = React.useState(initial.itemVariantId);
  const [base, setBase] = React.useState<Line[]>(initial.base);
  const [addonMap, setAddonMap] = React.useState<Record<string, Line[]>>(() =>
    Object.fromEntries(initial.addons.map((a) => [a.addonId, a.ingredients]))
  );
  const [openAddonId, setOpenAddonId] = React.useState<string | null>(null);

  // Reset on open with the latest props (covers Edit-after-Save refresh).
  React.useEffect(() => {
    if (open) {
      setItemId(initial.itemId);
      setVariantId(initial.itemVariantId);
      setBase(initial.base);
      setAddonMap(Object.fromEntries(initial.addons.map((a) => [a.addonId, a.ingredients])));
      setOpenAddonId(null);
    }
  }, [open, initial.itemId, initial.itemVariantId]);

  const item = items.find((i) => i.id === itemId);
  const variants = item?.variants ?? [];
  const addons = item?.addons ?? [];

  // When item changes (from picker), reset variant + clear lines.
  const onItemChange = (id: string) => {
    setItemId(id);
    const it = items.find((i) => i.id === id);
    setVariantId(it?.variants[0]?.id ?? "");
    setBase([]);
    setAddonMap({});
    setOpenAddonId(null);
  };

  const addBaseLine = () => setBase((arr) => [...arr, newLine(rms)]);
  const updateBaseLine = (idx: number, patch: Partial<Line>) =>
    setBase((arr) => arr.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeBaseLine = (idx: number) =>
    setBase((arr) => arr.filter((_, i) => i !== idx));

  const addAddonLine = (addonId: string) =>
    setAddonMap((m) => ({ ...m, [addonId]: [...(m[addonId] ?? []), newLine(rms)] }));
  const updateAddonLine = (addonId: string, idx: number, patch: Partial<Line>) =>
    setAddonMap((m) => ({
      ...m,
      [addonId]: (m[addonId] ?? []).map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  const removeAddonLine = (addonId: string, idx: number) =>
    setAddonMap((m) => ({
      ...m,
      [addonId]: (m[addonId] ?? []).filter((_, i) => i !== idx),
    }));

  // Live ingredient cost preview (base only — addons priced separately).
  const rmById = React.useMemo(() => new Map(rms.map((r) => [r.id, r])), [rms]);
  const baseCost = base.reduce(
    (s, l) => s + l.qty * (rmById.get(l.rawMaterialId)?.avgCost ?? 0),
    0
  );

  const submit = () => {
    if (!itemId || !variantId) {
      toast({ variant: "destructive", title: "Pick an item and variant" });
      return;
    }
    const cleanedBase = base.filter((l) => l.rawMaterialId && l.qty > 0);
    const cleanedAddons = Object.entries(addonMap)
      .map(([addonId, ingredients]) => ({
        addonId,
        ingredients: ingredients.filter((l) => l.rawMaterialId && l.qty > 0),
      }))
      .filter((g) => g.ingredients.length > 0);
    if (cleanedBase.length === 0 && cleanedAddons.length === 0) {
      toast({ variant: "destructive", title: "Add at least one base or addon ingredient" });
      return;
    }
    startTransition(async () => {
      const res = await saveRecipe({
        itemId,
        itemVariantId: variantId,
        base: cleanedBase,
        addons: cleanedAddons,
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't save recipe", description: res.error });
        return;
      }
      toast({ variant: "success", title: "Recipe saved" });
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {lockSelection
              ? `Recipe for ${item?.name ?? ""} (${variants.find((v) => v.id === variantId)?.name ?? ""})`
              : initial.base.length || initial.addons.length
                ? "Edit recipe"
                : "New recipe"}
          </DialogTitle>
          <DialogDescription>
            Define which raw materials get consumed when this variant sells.
            Optionally add per-addon ingredients below — they trigger only when
            the customer picks that addon.
          </DialogDescription>
        </DialogHeader>

        {/* Item + variant pickers — read-only when launched from Set/Edit. */}
        <div className="grid grid-cols-2 gap-3 pb-3 border-b">
          <div>
            <Label>Item</Label>
            {lockSelection ? (
              <div className="h-9 rounded-md border bg-muted/40 px-3 flex items-center text-sm">
                {item?.name ?? "—"}
              </div>
            ) : (
              <select
                value={itemId}
                onChange={(e) => onItemChange(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Pick an item…</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <Label>Variant</Label>
            {lockSelection ? (
              <div className="h-9 rounded-md border bg-muted/40 px-3 flex items-center text-sm">
                {variants.find((v) => v.id === variantId)?.name ?? "—"}
              </div>
            ) : (
              <select
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                disabled={!itemId}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-50"
              >
                <option value="">Pick a variant…</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Base ingredients */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Base ingredients</Label>
              <p className="text-[11px] text-muted-foreground">
                Always consumed when this variant sells.
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              Cost: <span className="font-semibold">₹{baseCost.toFixed(2)}</span>
            </div>
          </div>
          {base.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded-md">
              No base ingredients yet. Add the first one below.
            </div>
          ) : (
            <div className="space-y-1.5">
              {base.map((line, idx) => (
                <LineEditor
                  key={idx}
                  line={line}
                  rms={rms}
                  onChange={(patch) => updateBaseLine(idx, patch)}
                  onRemove={() => removeBaseLine(idx)}
                />
              ))}
            </div>
          )}
          <Button type="button" variant="outline" size="sm" onClick={addBaseLine}>
            <Plus className="h-3.5 w-3.5" />
            Add base ingredient
          </Button>
        </div>

        {/* Addons section */}
        {addons.length > 0 && (
          <div className="space-y-2 pt-3 border-t">
            <Label className="text-sm inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-600" />
              Addons for {item?.name}
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Each addon is only consumed when the customer selects it on the bill.
              Configured per variant — Extra Cheese can pull different ingredients
              for {variants.find((v) => v.id === variantId)?.name ?? "this variant"}{" "}
              than for other variants of {item?.name}.
            </p>
            <div className="space-y-1.5">
              {addons.map((a) => {
                const ingredients = addonMap[a.id] ?? [];
                const expanded = openAddonId === a.id;
                const hasIngredients = ingredients.length > 0;
                const Chevron = expanded ? ChevronDown : ChevronRight;
                return (
                  <div key={a.id} className="rounded-md border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenAddonId(expanded ? null : a.id)}
                      className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-accent/40"
                    >
                      <Chevron className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm flex-1">{a.name}</span>
                      {hasIngredients && (
                        <Badge variant="success" className="text-[9px]">
                          {ingredients.length} ingredient{ingredients.length === 1 ? "" : "s"}
                        </Badge>
                      )}
                      {!hasIngredients && (
                        <Badge variant="outline" className="text-[9px] text-muted-foreground">
                          empty
                        </Badge>
                      )}
                    </button>
                    {expanded && (
                      <div className="px-3 py-2 space-y-1.5 bg-muted/30 border-t">
                        {ingredients.length === 0 ? (
                          <div className="text-xs text-muted-foreground text-center py-3 border border-dashed rounded-md">
                            No ingredients configured for this addon.
                          </div>
                        ) : (
                          ingredients.map((line, idx) => (
                            <LineEditor
                              key={idx}
                              line={line}
                              rms={rms}
                              onChange={(patch) => updateAddonLine(a.id, idx, patch)}
                              onRemove={() => removeAddonLine(a.id, idx)}
                            />
                          ))
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addAddonLine(a.id)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add ingredient
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save recipe"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "+ New recipe" — same editor with no initial selection + open pickers. */
export function NewRecipeButton({
  children,
  items,
  rms,
}: {
  children: React.ReactNode;
  items: ItemOption[];
  rms: Rm[];
}) {
  return (
    <RecipeEditor
      items={items}
      rms={rms}
      initial={{ itemId: "", itemVariantId: "", base: [], addons: [] }}
      lockSelection={false}
    >
      {children}
    </RecipeEditor>
  );
}

function LineEditor({
  line,
  rms,
  onChange,
  onRemove,
}: {
  line: Line;
  rms: Rm[];
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_100px_80px_36px] gap-1.5">
      <select
        value={line.rawMaterialId}
        onChange={(e) => {
          const rm = rms.find((r) => r.id === e.target.value);
          onChange({ rawMaterialId: e.target.value, unit: rm?.unit ?? line.unit });
        }}
        className="h-9 rounded-md border bg-background px-2 text-sm"
      >
        <option value="">Pick item…</option>
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
        value={line.qty}
        onChange={(e) => onChange({ qty: Number(e.target.value) || 0 })}
        className="h-9 text-right"
      />
      <Input
        value={line.unit}
        onChange={(e) => onChange({ unit: e.target.value })}
        className="h-9 text-center"
      />
      <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="h-9 w-9">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
