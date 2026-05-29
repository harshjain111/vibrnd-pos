"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { saveRawMaterial, saveSupplier, adjustStock } from "./actions";

type RmInit = {
  id?: string;
  name: string;
  unit: string;
  parLevel: number;
  minLevel: number;
  currentQty: number;
  avgCost: number;
  supplierId?: string;
};

const UNITS = ["kg", "g", "ltr", "ml", "pcs", "pkt", "box"];

export function RmDialog({
  children,
  suppliers,
  initial,
}: {
  children: React.ReactNode;
  suppliers: { id: string; name: string }[];
  initial?: RmInit;
}) {
  const [open, setOpen] = React.useState(false);
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
            <Label>Supplier</Label>
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
