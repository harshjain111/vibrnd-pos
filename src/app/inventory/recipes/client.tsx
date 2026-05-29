"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2, Plus } from "lucide-react";
import { saveRecipe } from "../actions";

type Line = { rawMaterialId: string; qty: number; unit: string };

export function RecipeEditor({
  children,
  itemId,
  itemName,
  rms,
  initial,
}: {
  children: React.ReactNode;
  itemId: string;
  itemName: string;
  rms: { id: string; name: string; unit: string }[];
  initial: Line[];
}) {
  const [open, setOpen] = React.useState(false);
  const [lines, setLines] = React.useState<Line[]>(initial.length ? initial : []);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (open) setLines(initial.length ? initial : []);
  }, [open, initial]);

  const addLine = () => {
    const first = rms[0];
    if (!first) return;
    setLines((l) => [...l, { rawMaterialId: first.id, qty: 0.1, unit: first.unit }]);
  };

  const updateLine = (idx: number, patch: Partial<Line>) =>
    setLines((l) => l.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  const removeLine = (idx: number) => setLines((l) => l.filter((_, i) => i !== idx));

  const submit = () => {
    startTransition(async () => {
      await saveRecipe({ itemId, ingredients: lines.filter((l) => l.qty > 0) });
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Recipe for {itemName}</DialogTitle>
          <DialogDescription>
            Define ingredients and quantities. Auto-consumption deducts these from stock when the item sells.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {lines.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-6 border-2 border-dashed rounded-md">
              No ingredients yet. Add the first one below.
            </div>
          )}
          {lines.map((line, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_100px_80px_auto] gap-2">
              <select
                value={line.rawMaterialId}
                onChange={(e) => {
                  const rm = rms.find((r) => r.id === e.target.value);
                  updateLine(idx, { rawMaterialId: e.target.value, unit: rm?.unit ?? line.unit });
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
                value={line.qty}
                onChange={(e) => updateLine(idx, { qty: Number(e.target.value) || 0 })}
              />
              <Input value={line.unit} onChange={(e) => updateLine(idx, { unit: e.target.value })} />
              <Button variant="ghost" size="icon" onClick={() => removeLine(idx)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={addLine}>
          <Plus className="h-4 w-4" />
          Add ingredient
        </Button>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save recipe"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
