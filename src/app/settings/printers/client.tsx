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
import { savePrinter } from "./actions";

const STATION_LABELS: Record<string, string> = {
  MAIN: "Main kitchen",
  TANDOOR: "Tandoor",
  BAR: "Bar",
  DESSERT: "Dessert",
};

type Init = { id?: string; name: string; station: string; target: string; active: boolean };

export function PrinterDialog({
  children,
  initial,
  stations,
}: {
  children: React.ReactNode;
  initial?: Init;
  stations: string[];
}) {
  const [open, setOpen] = React.useState(false);
  const label = (s: string) => STATION_LABELS[s] ?? s.charAt(0) + s.slice(1).toLowerCase();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit printer" : "Add printer"}</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            await savePrinter(fd);
            setOpen(false);
          }}
          className="grid grid-cols-2 gap-3"
        >
          {initial?.id && <input type="hidden" name="id" value={initial.id} />}
          <div className="col-span-2">
            <Label>Printer name</Label>
            <Input name="name" defaultValue={initial?.name} placeholder="e.g. Kitchen Epson TM-T82" required />
          </div>
          <div>
            <Label>Department / station</Label>
            <select
              name="station"
              defaultValue={initial?.station ?? stations[0] ?? "MAIN"}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              {stations.map((s) => (
                <option key={s} value={s}>{label(s)}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Device target (optional)</Label>
            <Input name="target" defaultValue={initial?.target} placeholder="192.168.1.50:9100" />
          </div>
          <label className="col-span-2 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} />
            Active
          </label>
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
