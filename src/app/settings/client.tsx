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
import { saveTable } from "./actions";

export function TableDialog({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial?: { id?: string; name: string; area: string; capacity: number };
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit table" : "Add table"}</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            await saveTable(fd);
            setOpen(false);
          }}
          className="grid grid-cols-2 gap-3"
        >
          {initial?.id && <input type="hidden" name="id" value={initial.id} />}
          <div>
            <Label>Name</Label>
            <Input name="name" defaultValue={initial?.name} placeholder="T7" required />
          </div>
          <div>
            <Label>Capacity</Label>
            <Input name="capacity" type="number" min="1" defaultValue={initial?.capacity ?? 4} required />
          </div>
          <div className="col-span-2">
            <Label>Area</Label>
            <Input name="area" defaultValue={initial?.area ?? "Main"} placeholder="Main / Outdoor / Bar" />
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
