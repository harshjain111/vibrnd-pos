"use client";
import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { inr } from "@/lib/utils";
import { Trash2, Plus, Minus } from "lucide-react";
import { appendLines, removeLine } from "./actions";

type CatItem = {
  id: string;
  name: string;
  price: number;
  categoryName: string;
  isVeg: boolean;
  variants: { id: string; name: string; price: number }[];
  addons: { id: string; name: string; priceDelta: number }[];
};

type ExistingLine = { id: string; name: string; qty: number; price: number };

type NewLine = { itemId: string; name: string; qty: number; unitPrice: number; variantName?: string; addons: { name: string; priceDelta: number }[] };

export function OrderEditor({
  orderId,
  invoiceNo,
  existingLines,
  catalog,
}: {
  orderId: string;
  invoiceNo: string;
  existingLines: ExistingLine[];
  catalog: CatItem[];
}) {
  const { toast } = useToast();
  const [reason, setReason] = React.useState("");
  const [adds, setAdds] = React.useState<NewLine[]>([]);
  const [search, setSearch] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const filtered = catalog.filter((c) =>
    !search ? true : c.name.toLowerCase().includes(search.toLowerCase())
  );

  const addToCart = (it: CatItem) => {
    // Simple add: ignore picker for now. Use base price + no addons.
    const unit = it.variants[0]?.price ?? it.price;
    const variantName = it.variants[0]?.name;
    setAdds((c) => {
      const existing = c.find((l) => l.itemId === it.id && l.variantName === variantName);
      if (existing) return c.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { itemId: it.id, name: it.name, qty: 1, unitPrice: unit, variantName, addons: [] }];
    });
  };
  const inc = (idx: number) => setAdds((c) => c.map((l, i) => (i === idx ? { ...l, qty: l.qty + 1 } : l)));
  const dec = (idx: number) =>
    setAdds((c) =>
      c.flatMap((l, i) => (i === idx ? (l.qty <= 1 ? [] : [{ ...l, qty: l.qty - 1 }]) : [l]))
    );
  const remove = (idx: number) => setAdds((c) => c.filter((_, i) => i !== idx));

  const subAdd = adds.reduce((s, l) => s + l.unitPrice * l.qty, 0);

  const submitAdd = () => {
    if (reason.trim().length < 3) {
      toast({ variant: "destructive", title: "Reason required", description: "Min 3 characters." });
      return;
    }
    if (adds.length === 0) {
      toast({ variant: "destructive", title: "No items added" });
      return;
    }
    startTransition(async () => {
      try {
        await appendLines({
          orderId,
          reason: reason.trim(),
          lines: adds.map((l) => ({
            itemId: l.itemId,
            qty: l.qty,
            unitPrice: l.unitPrice,
            variantName: l.variantName,
            addons: l.addons,
          })),
        });
        toast({ variant: "success", title: `Amended ${invoiceNo}`, description: `Added ${adds.length} line${adds.length === 1 ? "" : "s"}` });
        // server action redirects to /orders/[id]
      } catch (e) {
        toast({ variant: "destructive", title: "Failed to amend", description: String(e) });
      }
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Existing lines</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {existingLines.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">No lines.</div>
            ) : (
              <ul className="divide-y">
                {existingLines.map((li) => (
                  <li key={li.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex-1 text-sm font-medium">{li.name}</span>
                    <span className="text-xs text-muted-foreground">{inr(li.price)} × {li.qty}</span>
                    <RemoveLineButton orderId={orderId} orderItemId={li.id} name={li.name} qty={li.qty} reason={reason} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add new lines</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Search catalog…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
              {filtered.map((it) => (
                <button
                  key={it.id}
                  onClick={() => addToCart(it)}
                  className="text-left border rounded-md p-2.5 hover:border-primary"
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2.5 w-2.5 rounded-sm border ${it.isVeg ? "border-emerald-600" : "border-rose-600"}`}>
                      <span className={`block h-1 w-1 m-auto mt-[3px] rounded-full ${it.isVeg ? "bg-emerald-600" : "bg-rose-600"}`} />
                    </span>
                    <span className="text-xs text-muted-foreground">{it.categoryName}</span>
                  </div>
                  <div className="text-sm font-medium leading-tight mt-1">{it.name}</div>
                  <div className="text-xs font-semibold mt-1">
                    {it.variants.length ? `from ${inr(Math.min(...it.variants.map((v) => v.price)))}` : inr(it.price)}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-20 self-start">
        <CardHeader>
          <CardTitle>Amend summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Reason (required)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer requested an extra item"
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Lines to add</div>
            {adds.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-2">No new items yet</div>
            ) : (
              adds.map((l, i) => (
                <div key={i} className="flex items-center gap-2 text-sm border-b py-1.5 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{l.name}{l.variantName ? ` · ${l.variantName}` : ""}</div>
                    <div className="text-xs text-muted-foreground">{inr(l.unitPrice)} × {l.qty}</div>
                  </div>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => dec(i)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-5 text-center text-sm">{l.qty}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => inc(i)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => remove(i)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between text-base font-semibold pt-2 border-t">
            <span>Added value</span>
            <span>{inr(subAdd)}</span>
          </div>

          <Button onClick={submitAdd} disabled={pending || adds.length === 0} className="w-full" size="lg">
            {pending ? "Saving…" : "Save amendment"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function RemoveLineButton({
  orderId,
  orderItemId,
  name,
  qty,
  reason,
}: {
  orderId: string;
  orderItemId: string;
  name: string;
  qty: number;
  reason: string;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-muted-foreground"
      title={`Remove ${name}`}
      onClick={() => {
        if (reason.trim().length < 3) {
          toast({ variant: "destructive", title: "Enter a reason first", description: "Reason field is mandatory for any line change." });
          return;
        }
        if (!confirm(`Remove ${name} ×${qty}? Stock will be reversed and the change logged.`)) return;
        startTransition(async () => {
          try {
            await removeLine({ orderId, orderItemId, reason: reason.trim() });
            toast({ variant: "warning", title: `Removed ${name}` });
          } catch (e) {
            toast({ variant: "destructive", title: "Failed to remove", description: String(e) });
          }
        });
      }}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
