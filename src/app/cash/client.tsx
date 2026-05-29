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
import { useToast } from "@/components/ui/use-toast";
import { saveCashEntry } from "./actions";

const KINDS = [
  { value: "OPENING", label: "Opening cash" },
  { value: "TOP_UP", label: "Top-up" },
  { value: "WITHDRAWAL", label: "Withdrawal" },
] as const;

export function CashEntryDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const { toast } = useToast();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New cash entry</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            await saveCashEntry(fd);
            toast({ variant: "success", title: "Saved" });
            setOpen(false);
          }}
          className="grid grid-cols-2 gap-3"
        >
          <div>
            <Label>Kind</Label>
            <select name="kind" defaultValue="OPENING" className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Amount (₹)</Label>
            <Input name="amount" type="number" step="0.01" min="0.01" required />
          </div>
          <div className="col-span-2">
            <Label>Reason (optional)</Label>
            <Input name="reason" placeholder="Float for the day · vendor pay · bank deposit…" />
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
