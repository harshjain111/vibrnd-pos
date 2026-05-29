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
import { saveSubType } from "./actions";

type Init = { id?: string; name: string; parentType: "DINE_IN" | "PICKUP" | "DELIVERY"; rank: number; active: boolean };

export function SubTypeDialog({ children, initial }: { children: React.ReactNode; initial?: Init }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit sub-type" : "Add sub-type"}</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            await saveSubType(fd);
            setOpen(false);
          }}
          className="grid grid-cols-2 gap-3"
        >
          {initial?.id && <input type="hidden" name="id" value={initial.id} />}
          <div className="col-span-2">
            <Label>Name</Label>
            <Input name="name" defaultValue={initial?.name} placeholder="Parcel / Bar / Late Night" required />
          </div>
          <div>
            <Label>Parent type</Label>
            <select
              name="parentType"
              defaultValue={initial?.parentType ?? "DINE_IN"}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="DINE_IN">Dine in</option>
              <option value="PICKUP">Pickup</option>
              <option value="DELIVERY">Delivery</option>
            </select>
          </div>
          <div>
            <Label>Rank</Label>
            <Input name="rank" type="number" defaultValue={initial?.rank ?? 0} />
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
