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
import { Trash2 } from "lucide-react";
import { saveAsset, deleteAsset } from "./actions";

type Initial = {
  id?: string;
  name?: string;
  category?: "FURNITURE" | "KITCHEN" | "ELECTRONICS" | "DECOR" | "OTHER";
  location?: string;
  qty?: number;
  unitValue?: number;
  condition?: "GOOD" | "FAIR" | "DAMAGED" | "DISCARDED";
  purchasedAt?: string;
  notes?: string;
};

export function AssetDialog({ children, initial }: { children: React.ReactNode; initial?: Initial }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit asset" : "Add fixed asset"}</DialogTitle>
          <DialogDescription>
            One row per <em>type</em> of asset — e.g. "Dining table 4-seater" qty 8.
            Audit later to catch theft / damage.
          </DialogDescription>
        </DialogHeader>
        <form
          action={async (fd) => {
            try {
              await saveAsset(fd);
              toast({ variant: "success", title: initial?.id ? "Asset updated" : "Asset added" });
              setOpen(false);
              router.refresh();
            } catch (e) {
              toast({ variant: "destructive", title: "Save failed", description: String(e) });
            }
          }}
          className="grid grid-cols-2 gap-3"
        >
          {initial?.id && <input type="hidden" name="id" value={initial.id} />}
          <div className="col-span-2">
            <Label>Name</Label>
            <Input name="name" required defaultValue={initial?.name} placeholder="Dining table 4-seater" />
          </div>
          <div>
            <Label>Category</Label>
            <select
              name="category"
              defaultValue={initial?.category ?? "FURNITURE"}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="FURNITURE">Furniture</option>
              <option value="KITCHEN">Kitchen equipment</option>
              <option value="ELECTRONICS">Electronics</option>
              <option value="DECOR">Decor</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <Label>Location</Label>
            <Input name="location" defaultValue={initial?.location ?? ""} placeholder="Hall A / Kitchen / Storeroom" />
          </div>
          <div>
            <Label>Quantity</Label>
            <Input name="qty" type="number" min="0" required defaultValue={initial?.qty ?? 1} />
          </div>
          <div>
            <Label>Unit value (₹)</Label>
            <Input
              name="unitValue"
              type="number"
              step="0.01"
              min="0"
              defaultValue={initial?.unitValue ?? 0}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label>Condition</Label>
            <select
              name="condition"
              defaultValue={initial?.condition ?? "GOOD"}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="GOOD">Good</option>
              <option value="FAIR">Fair</option>
              <option value="DAMAGED">Damaged</option>
              <option value="DISCARDED">Discarded</option>
            </select>
          </div>
          <div>
            <Label>Purchased on (optional)</Label>
            <Input name="purchasedAt" type="date" defaultValue={initial?.purchasedAt ?? ""} />
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Input name="notes" defaultValue={initial?.notes ?? ""} placeholder="Vendor / warranty / serial #" />
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

export function DeleteAssetBtn({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <form
      action={async (fd) => {
        if (!confirm("Remove this asset from the register? Past audits stay intact.")) return;
        try {
          await deleteAsset(fd);
          toast({ variant: "success", title: "Asset removed" });
          router.refresh();
        } catch (e) {
          toast({ variant: "destructive", title: "Delete failed", description: String(e) });
        }
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" className="text-rose-600">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </form>
  );
}
