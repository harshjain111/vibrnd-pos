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
import { saveDiscount } from "./actions";

type Init = {
  id?: string;
  code: string;
  name: string;
  type: "FLAT" | "PERCENT" | "BOGO";
  value: number;
  minOrder: number;
  maxDiscount?: number;
  active: boolean;
};

export function DiscountDialog({ children, initial }: { children: React.ReactNode; initial?: Init }) {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<Init["type"]>(initial?.type ?? "PERCENT");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit discount" : "Add discount"}</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            await saveDiscount(fd);
            setOpen(false);
          }}
          className="grid grid-cols-2 gap-3"
        >
          {initial?.id && <input type="hidden" name="id" value={initial.id} />}
          <div>
            <Label>Code</Label>
            <Input name="code" defaultValue={initial?.code} placeholder="WELCOME10" required />
          </div>
          <div>
            <Label>Type</Label>
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value as Init["type"])}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="PERCENT">Percent off</option>
              <option value="FLAT">Flat ₹ off</option>
              <option value="BOGO">Buy one get one (50% off)</option>
            </select>
          </div>
          <div className="col-span-2">
            <Label>Name (shown to staff)</Label>
            <Input name="name" defaultValue={initial?.name} placeholder="Welcome offer" required />
          </div>
          <div>
            <Label>{type === "PERCENT" ? "Percent (0-100)" : "Amount (₹)"}</Label>
            <Input name="value" type="number" step="0.01" min="0" defaultValue={initial?.value ?? (type === "PERCENT" ? 10 : 50)} required />
          </div>
          <div>
            <Label>Min order (₹)</Label>
            <Input name="minOrder" type="number" step="0.01" min="0" defaultValue={initial?.minOrder ?? 0} />
          </div>
          {(type === "PERCENT" || type === "BOGO") && (
            <div className="col-span-2">
              <Label>Cap (₹) — leave blank for no cap</Label>
              <Input name="maxDiscount" type="number" step="0.01" min="0" defaultValue={initial?.maxDiscount ?? ""} />
            </div>
          )}
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
