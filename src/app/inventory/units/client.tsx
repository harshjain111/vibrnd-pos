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
import { saveUnit, deleteUnit, seedDefaultUnits } from "./actions";

export function UnitDialog({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial?: { id: string; name: string; baseUnit: string; conversionFactor: number };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit unit" : "New unit"}</DialogTitle>
          <DialogDescription>
            Optional <strong>base unit + conversion factor</strong> lets sub-units (e.g. 1 BOX = 12 Piece) auto-normalise on save.
          </DialogDescription>
        </DialogHeader>
        <form
          action={async (fd) => {
            await saveUnit(fd);
            toast({ variant: "success", title: initial?.id ? "Unit updated" : "Unit added" });
            setOpen(false);
            router.refresh();
          }}
          className="space-y-3"
        >
          {initial?.id && <input type="hidden" name="id" value={initial.id} />}
          <div>
            <Label>Name</Label>
            <Input name="name" required defaultValue={initial?.name} placeholder="kg" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Base unit (optional)</Label>
              <Input name="baseUnit" defaultValue={initial?.baseUnit} placeholder="g" />
            </div>
            <div>
              <Label>Conversion factor</Label>
              <Input
                name="conversionFactor"
                type="number"
                step="0.01"
                min="0.01"
                defaultValue={initial?.conversionFactor ?? 1}
              />
            </div>
          </div>
          <DialogFooter>
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

export function DeleteUnitBtn({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <form
      action={async (fd) => {
        if (!confirm("Delete this unit?")) return;
        try {
          await deleteUnit(fd);
          toast({ variant: "success", title: "Unit deleted" });
          router.refresh();
        } catch (e) {
          toast({ variant: "destructive", title: "Couldn't delete", description: String(e) });
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" className="text-rose-600">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </form>
  );
}

export function SeedDefaultsBtn({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <form
      action={async () => {
        await seedDefaultUnits();
        toast({ variant: "success", title: "Seeded 21 default units" });
        router.refresh();
      }}
      className="inline"
    >
      <button type="submit" className="contents">
        {children}
      </button>
    </form>
  );
}
