"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Save, Trash2 } from "lucide-react";
import {
  saveRawMaterial,
  saveSupplier,
  adjustStock,
  saveRawMaterialSuppliers,
} from "./actions";

type RmInit = {
  id?: string;
  name: string;
  unit: string;
  parLevel: number;
  minLevel: number;
  currentQty: number;
  avgCost: number;
  supplierId?: string;
  categoryName?: string;
  subCategory?: string;
};

const UNITS = ["kg", "g", "ltr", "ml", "pcs", "pkt", "box"];

/**
 * Inline create-or-pick combo box. Existing values come from the parent;
 * picking "+ Add new…" swaps the select for a text input so the SM can
 * coin a fresh category without leaving the dialog. The field name is
 * preserved either way so the surrounding <form> sees one consistent
 * payload.
 */
function CategoryComboBox({
  name,
  label,
  options,
  initial,
  placeholder,
  disabled,
  onChange,
}: {
  name: string;
  label: string;
  options: string[];
  initial?: string;
  placeholder: string;
  disabled?: boolean;
  onChange?: (next: string) => void;
}) {
  // Bootstrap: if the saved value isn't in the option list, drop into
  // "new" mode so the user sees and can edit it.
  const initialMode: "pick" | "new" =
    initial && !options.includes(initial) ? "new" : "pick";
  const [mode, setMode] = React.useState<"pick" | "new">(initialMode);
  const [pick, setPick] = React.useState(initial ?? "");
  const [draft, setDraft] = React.useState(initial && initialMode === "new" ? initial : "");
  React.useEffect(() => {
    onChange?.(mode === "new" ? draft : pick);
  }, [mode, pick, draft, onChange]);
  return (
    <div>
      <Label>{label}</Label>
      {mode === "pick" ? (
        <div className="flex gap-1">
          <select
            value={pick}
            onChange={(e) => {
              if (e.target.value === "__new__") {
                setMode("new");
                setDraft("");
                setPick("");
              } else {
                setPick(e.target.value);
              }
            }}
            disabled={disabled}
            className="h-9 flex-1 rounded-md border bg-background px-3 text-sm disabled:opacity-50"
          >
            <option value="">{placeholder}</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            <option value="__new__">+ Add new…</option>
          </select>
          <input type="hidden" name={name} value={pick} />
        </div>
      ) : (
        <div className="flex gap-1">
          <Input
            name={name}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a new category"
            disabled={disabled}
            autoFocus
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setMode("pick");
              setDraft("");
            }}
            title="Back to picker"
          >
            ←
          </Button>
        </div>
      )}
    </div>
  );
}

export function RmDialog({
  children,
  suppliers,
  categories,
  subCategoriesByCategory,
  initial,
}: {
  children: React.ReactNode;
  suppliers: { id: string; name: string }[];
  /** Distinct existing category names from the catalog. */
  categories?: string[];
  /** Map of category → sub-categories so the sub-category dropdown stays
   *  scoped to whatever the user just picked. */
  subCategoriesByCategory?: Record<string, string[]>;
  initial?: RmInit;
}) {
  const [open, setOpen] = React.useState(false);
  // Track the currently-picked category so the sub-category combo can
  // filter its option list. Kept in component state because both combos
  // need to stay in sync as the user types.
  const [pickedCategory, setPickedCategory] = React.useState(initial?.categoryName ?? "");
  React.useEffect(() => {
    if (open) setPickedCategory(initial?.categoryName ?? "");
  }, [open, initial?.categoryName]);

  const allCategories = categories ?? [];
  const subOptions = (subCategoriesByCategory?.[pickedCategory] ?? []).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit raw material" : "Add raw material"}</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            await saveRawMaterial(fd);
            setOpen(false);
          }}
          className="grid grid-cols-2 gap-3"
        >
          {initial?.id && <input type="hidden" name="id" value={initial.id} />}
          <div className="col-span-2">
            <Label>Name</Label>
            <Input name="name" defaultValue={initial?.name} required />
          </div>
          <CategoryComboBox
            key={`cat-${open}`}
            name="categoryName"
            label="Category"
            options={allCategories}
            initial={initial?.categoryName}
            placeholder="Pick a category…"
            onChange={(next) => setPickedCategory(next)}
          />
          <CategoryComboBox
            key={`sub-${open}-${pickedCategory}`}
            name="subCategory"
            label="Sub-category"
            options={subOptions}
            initial={initial?.subCategory}
            placeholder={pickedCategory ? "Pick a sub-category…" : "Pick a category first"}
            disabled={!pickedCategory}
          />
          <div>
            <Label>Unit</Label>
            <select name="unit" defaultValue={initial?.unit ?? "kg"} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Supplier (quick pick)</Label>
            <select name="supplierId" defaultValue={initial?.supplierId ?? ""} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">— None —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Current qty</Label>
            <Input name="currentQty" type="number" step="0.01" min="0" defaultValue={initial?.currentQty ?? 0} required />
          </div>
          <div>
            <Label>Avg cost (₹/unit)</Label>
            <Input name="avgCost" type="number" step="0.01" min="0" defaultValue={initial?.avgCost ?? 0} required />
          </div>
          <div>
            <Label>Min level</Label>
            <Input name="minLevel" type="number" step="0.01" min="0" defaultValue={initial?.minLevel ?? 0} />
          </div>
          <div>
            <Label>Par level</Label>
            <Input name="parLevel" type="number" step="0.01" min="0" defaultValue={initial?.parLevel ?? 0} />
          </div>
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StockAdjust({ id, unit }: { id: string; unit: string }) {
  return (
    <form action={adjustStock} className="inline-flex items-center gap-1">
      <input type="hidden" name="id" value={id} />
      <input
        name="delta"
        type="number"
        step="0.1"
        placeholder={`± ${unit}`}
        className="h-8 w-20 rounded border bg-background px-2 text-right text-sm"
      />
      <Button type="submit" size="sm" variant="outline">
        Apply
      </Button>
    </form>
  );
}

export function SupplierDialog({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial?: { id?: string; name: string; contact?: string; phone?: string; gstin?: string; address?: string };
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit supplier" : "Add supplier"}</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            await saveSupplier(fd);
            setOpen(false);
          }}
          className="grid grid-cols-2 gap-3"
        >
          {initial?.id && <input type="hidden" name="id" value={initial.id} />}
          <div className="col-span-2">
            <Label>Name</Label>
            <Input name="name" defaultValue={initial?.name} required />
          </div>
          <div>
            <Label>Contact person</Label>
            <Input name="contact" defaultValue={initial?.contact} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input name="phone" defaultValue={initial?.phone} />
          </div>
          <div>
            <Label>GSTIN</Label>
            <Input name="gstin" defaultValue={initial?.gstin} />
          </div>
          <div>
            <Label>Address</Label>
            <Input name="address" defaultValue={initial?.address} />
          </div>
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Quick "Manage suppliers" dialog scoped to a single raw material.
   Mirror of the supplier rate-card editor but pivoted — one item × many
   vendors instead of one vendor × many items.
   ────────────────────────────────────────────────────────────────────── */

export type RmSupplierEntry = {
  supplierId: string;
  negotiatedRate: number;
  isPrimary: boolean;
};

type RmRow = {
  key: string;
  supplierId: string;
  negotiatedRate: string;
  isPrimary: boolean;
};

export function ManageRmSuppliersDialog({
  children,
  rawMaterialId,
  rawMaterialName,
  rawMaterialUnit,
  suppliers,
  initialEntries,
}: {
  children: React.ReactNode;
  rawMaterialId: string;
  rawMaterialName: string;
  rawMaterialUnit: string;
  suppliers: { id: string; name: string }[];
  initialEntries: RmSupplierEntry[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [rows, setRows] = React.useState<RmRow[]>([]);

  // Hydrate the editor every time the dialog opens so it picks up
  // server-side changes since the last interaction.
  React.useEffect(() => {
    if (!open) return;
    setRows(
      initialEntries.length > 0
        ? initialEntries.map((e) => ({
            key: Math.random().toString(36).slice(2),
            supplierId: e.supplierId,
            negotiatedRate: String(e.negotiatedRate),
            isPrimary: e.isPrimary,
          }))
        : [
            {
              key: Math.random().toString(36).slice(2),
              supplierId: "",
              negotiatedRate: "",
              isPrimary: true,
            },
          ]
    );
  }, [open, initialEntries]);

  const takenSupplierIds = React.useMemo(
    () => new Set(rows.map((r) => r.supplierId).filter(Boolean)),
    [rows]
  );

  const updateRow = (key: string, patch: Partial<RmRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((rs) => [
      ...rs,
      {
        key: Math.random().toString(36).slice(2),
        supplierId: "",
        negotiatedRate: "",
        isPrimary: rs.length === 0,
      },
    ]);
  const removeRow = (key: string) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  const togglePrimary = (key: string, on: boolean) =>
    setRows((rs) =>
      rs.map((r) => ({
        ...r,
        // Mutually-exclusive — ticking one un-ticks others.
        isPrimary: r.key === key ? on : on ? false : r.isPrimary,
      }))
    );

  const submit = () => {
    const cleaned = rows
      .filter((r) => r.supplierId && Number(r.negotiatedRate) >= 0)
      .map((r) => ({
        supplierId: r.supplierId,
        negotiatedRate: Number(r.negotiatedRate),
        isPrimary: r.isPrimary,
      }));
    startTransition(async () => {
      const res = await saveRawMaterialSuppliers({ rawMaterialId, rows: cleaned });
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Couldn't save",
          description: res.error,
        });
        return;
      }
      toast({
        variant: "success",
        title:
          cleaned.length === 0
            ? "Cleared all suppliers"
            : `Saved ${cleaned.length} supplier(s)`,
        description:
          cleaned.length === 0
            ? rawMaterialName
            : `${rawMaterialName} · POs will auto-suggest the primary`,
      });
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage suppliers for {rawMaterialName}</DialogTitle>
          <DialogDescription>
            Add every vendor that supplies this item along with the negotiated
            rate. Mark one as <strong>Primary</strong> — that's the default
            the PO builder reaches for.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2">Supplier</th>
                  <th className="text-right p-2 w-36">Rate ₹ / {rawMaterialUnit}</th>
                  <th className="text-center p-2 w-24">Primary</th>
                  <th className="text-right p-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t">
                    <td className="p-2">
                      <select
                        value={r.supplierId}
                        onChange={(e) => updateRow(r.key, { supplierId: e.target.value })}
                        className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                      >
                        <option value="">Pick a supplier…</option>
                        {suppliers.map((s) => {
                          const blocked =
                            takenSupplierIds.has(s.id) && s.id !== r.supplierId;
                          return (
                            <option key={s.id} value={s.id} disabled={blocked}>
                              {s.name}
                              {blocked ? " (already assigned)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </td>
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={r.negotiatedRate}
                        onChange={(e) =>
                          updateRow(r.key, { negotiatedRate: e.target.value })
                        }
                        className="h-8 w-32 text-right ml-auto"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={r.isPrimary}
                        onChange={(e) => togglePrimary(r.key, e.target.checked)}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="p-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRow(r.key)}
                        disabled={rows.length === 1}
                        title="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" /> Add vendor
          </Button>
          {rows.every((r) => !r.isPrimary) && rows.some((r) => r.supplierId) && (
            <div className="text-[11px] text-amber-700">
              No primary picked — the first vendor in the list will be treated
              as primary on save.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            <Save className="h-4 w-4" />
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
