"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
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
import { saveItem, saveCategory, deleteItem, toggleOutOfStock, saveVariants, saveAddons } from "./actions";
import { Trash2, Plus } from "lucide-react";
import { saveTaxSlab, deleteTaxSlab } from "./taxes/actions";

type Variant = { id?: string; name: string; price: number };
type Addon = { id?: string; name: string; priceDelta: number };

type ItemInit = {
  id?: string;
  name: string;
  shortCode: string;
  description: string;
  price: number;
  taxRate: number;
  categoryId: string;
  isVeg: boolean;
  active: boolean;
  outOfStock: boolean;
  variants?: Variant[];
  addons?: Addon[];
};

export function ItemDialog({
  children,
  categories,
  taxSlabs,
  initial,
}: {
  children: React.ReactNode;
  categories: { id: string; name: string }[];
  taxSlabs: { name: string; rate: number }[];
  initial?: ItemInit;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [variants, setVariants] = React.useState<Variant[]>(initial?.variants ?? []);
  const [addons, setAddons] = React.useState<Addon[]>(initial?.addons ?? []);
  const [pending, startTransition] = React.useTransition();

  // Refresh local state when dialog opens with a different item
  React.useEffect(() => {
    if (open) {
      setVariants(initial?.variants ?? []);
      setAddons(initial?.addons ?? []);
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit item" : "Add item"}</DialogTitle>
          <DialogDescription>
            Name, price, category, GST + optional variants and addons — all in one place.
          </DialogDescription>
        </DialogHeader>
        <form
          action={async (fd) => {
            startTransition(async () => {
              try {
                // Save item first to know the id
                let savedId = initial?.id;
                if (!savedId) {
                  // create item
                  await saveItem(fd);
                  // We need the id — refetch via a lightweight call. Easiest: just close + refresh.
                  // For an MVP simple flow, support variants/addons only when editing existing item.
                  toast({ variant: "success", title: "Item added" });
                } else {
                  await saveItem(fd);
                  // Save variants
                  await saveVariants({
                    itemId: savedId,
                    variants: variants.filter((v) => v.name.trim().length > 0).map((v) => ({
                      id: v.id,
                      name: v.name,
                      price: v.price,
                    })),
                  });
                  // Save addons
                  await saveAddons({
                    itemId: savedId,
                    addons: addons.filter((a) => a.name.trim().length > 0).map((a) => ({
                      id: a.id,
                      name: a.name,
                      priceDelta: a.priceDelta,
                    })),
                  });
                  toast({ variant: "success", title: "Item saved", description: "Variants & addons updated" });
                }
                setOpen(false);
                router.refresh();
              } catch (e) {
                toast({ variant: "destructive", title: "Save failed", description: String(e) });
              }
            });
          }}
          className="grid grid-cols-2 gap-3"
        >
          {initial?.id && <input type="hidden" name="id" value={initial.id} />}

          <div className="col-span-2">
            <Label>Name</Label>
            <Input name="name" defaultValue={initial?.name} required />
          </div>
          <div>
            <Label>Short code</Label>
            <Input name="shortCode" defaultValue={initial?.shortCode} placeholder="optional" />
          </div>
          <div>
            <Label>Category</Label>
            <select
              name="categoryId"
              defaultValue={initial?.categoryId ?? categories[0]?.id}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              required
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Price (₹)</Label>
            <Input name="price" type="number" step="0.01" min="0" defaultValue={initial?.price ?? 0} required />
          </div>
          <div>
            <Label>GST slab</Label>
            <select
              name="taxRate"
              defaultValue={initial?.taxRate ?? (taxSlabs[0]?.rate ?? 5)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              required
            >
              {taxSlabs.length === 0 && <option value="5">GST 5%</option>}
              {taxSlabs.map((t) => (
                <option key={t.rate} value={t.rate}>
                  {t.name} ({t.rate}%)
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <Label>Description</Label>
            <Input name="description" defaultValue={initial?.description} placeholder="Optional" />
          </div>

          <div className="col-span-2 flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="isVeg" defaultChecked={initial?.isVeg ?? true} />
              Vegetarian
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} />
              Active
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="outOfStock" defaultChecked={initial?.outOfStock ?? false} />
              Out of stock
            </label>
          </div>

          {/* Variants + addons only editable when item exists (need id to save them) */}
          {initial?.id && (
            <>
              <div className="col-span-2 border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm">Variants (e.g. Half / Full)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setVariants((v) => [...v, { name: "", price: initial?.price ?? 0 }])}
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {variants.length === 0 && (
                    <div className="text-xs text-muted-foreground italic">
                      No variants. Item sells at the base price above.
                    </div>
                  )}
                  {variants.map((v, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_120px_auto] gap-2">
                      <Input
                        value={v.name}
                        onChange={(e) =>
                          setVariants((vs) => vs.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))
                        }
                        placeholder="Variant name (Half)"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={v.price}
                        onChange={(e) =>
                          setVariants((vs) =>
                            vs.map((x, i) => (i === idx ? { ...x, price: Number(e.target.value) || 0 } : x))
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setVariants((vs) => vs.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm">Addons (e.g. Extra cheese)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAddons((a) => [...a, { name: "", priceDelta: 0 }])}
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {addons.length === 0 && (
                    <div className="text-xs text-muted-foreground italic">No addons configured.</div>
                  )}
                  {addons.map((a, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_120px_auto] gap-2">
                      <Input
                        value={a.name}
                        onChange={(e) =>
                          setAddons((as) => as.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))
                        }
                        placeholder="Addon name"
                      />
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          +₹
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          className="pl-7"
                          value={a.priceDelta}
                          onChange={(e) =>
                            setAddons((as) =>
                              as.map((x, i) => (i === idx ? { ...x, priceDelta: Number(e.target.value) || 0 } : x))
                            )
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setAddons((as) => as.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {!initial?.id && (
            <div className="col-span-2 text-xs text-muted-foreground border-t pt-2">
              Save the item first, then re-open it to add variants and addons.
            </div>
          )}

          <DialogFooter className="col-span-2 mt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : initial?.id ? "Save changes" : "Add item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CategoryDialog({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial?: { id?: string; name: string; rank: number };
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit category" : "Add category"}</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            await saveCategory(fd);
            setOpen(false);
            router.refresh();
          }}
          className="space-y-3"
        >
          {initial?.id && <input type="hidden" name="id" value={initial.id} />}
          <div>
            <Label>Name</Label>
            <Input name="name" defaultValue={initial?.name} required />
          </div>
          <div>
            <Label>Display rank</Label>
            <Input name="rank" type="number" defaultValue={initial?.rank ?? 0} />
          </div>
          <DialogFooter>
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

export function TaxSlabDialog({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial?: { id?: string; name: string; rate: number; active: boolean };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit tax slab" : "Add tax slab"}</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            await saveTaxSlab(fd);
            toast({ variant: "success", title: "Saved" });
            setOpen(false);
            router.refresh();
          }}
          className="grid grid-cols-2 gap-3"
        >
          {initial?.id && <input type="hidden" name="id" value={initial.id} />}
          <div>
            <Label>Name</Label>
            <Input name="name" defaultValue={initial?.name} placeholder="GST 5%" required />
          </div>
          <div>
            <Label>Rate (%)</Label>
            <Input name="rate" type="number" step="0.01" min="0" max="100" defaultValue={initial?.rate ?? 5} required />
          </div>
          <label className="col-span-2 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} />
            Active
          </label>
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

export function DeleteTaxSlabBtn({ id }: { id: string }) {
  const router = useRouter();
  return (
    <form
      action={async (fd) => {
        await deleteTaxSlab(fd);
        router.refresh();
      }}
      onSubmit={(e) => {
        if (!confirm("Delete this tax slab? Items at this rate keep their per-item rate.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
        <Trash2 className="h-4 w-4" />
      </Button>
    </form>
  );
}

export function OutOfStockToggle({ id, outOfStock }: { id: string; outOfStock: boolean }) {
  return (
    <form action={toggleOutOfStock}>
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant={outOfStock ? "secondary" : "ghost"}
        size="sm"
        title={
          outOfStock
            ? "Item is currently hidden from POS, Digital Menu and aggregators. Click to put it back in stock."
            : "Mark this item as out of stock. It will be greyed out on POS and pushed out-of-stock on Swiggy / Zomato within 60 seconds."
        }
      >
        {outOfStock ? "Mark in stock" : "Mark out of stock"}
      </Button>
    </form>
  );
}

export function DeleteItemBtn({ id }: { id: string }) {
  return (
    <form
      action={deleteItem}
      onSubmit={(e) => {
        if (!confirm("Deactivate this item? Order history is preserved.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
        <Trash2 className="h-4 w-4" />
      </Button>
    </form>
  );
}
