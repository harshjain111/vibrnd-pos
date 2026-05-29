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
import { saveCustomer } from "./actions";

export function CustomerDialog({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial?: { id?: string; name: string; phone: string; email: string; address: string; gstin: string; tags: string };
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit customer" : "Add customer"}</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            await saveCustomer(fd);
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
            <Label>Phone</Label>
            <Input name="phone" defaultValue={initial?.phone} />
          </div>
          <div>
            <Label>Email</Label>
            <Input name="email" type="email" defaultValue={initial?.email} />
          </div>
          <div className="col-span-2">
            <Label>Address</Label>
            <Input name="address" defaultValue={initial?.address} />
          </div>
          <div>
            <Label>GSTIN</Label>
            <Input name="gstin" defaultValue={initial?.gstin} />
          </div>
          <div>
            <Label>Tags (comma separated)</Label>
            <Input name="tags" defaultValue={initial?.tags} placeholder="VIP, REGULAR" />
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
