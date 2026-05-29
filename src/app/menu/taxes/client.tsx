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
import { saveTaxSlab } from "./actions";

export function SlabDialog({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial?: { id?: string; name: string; rate: number; active: boolean };
}) {
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
            setOpen(false);
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
