"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
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
import { Power, Check } from "lucide-react";
import { createOutlet, switchOutlet, deactivateOutlet } from "./actions";

export function NewOutletDialog({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New outlet</DialogTitle>
        </DialogHeader>
        <form
          action={(fd) => {
            setErr(null);
            startTransition(async () => {
              const res = await createOutlet(fd);
              if (res.error) {
                setErr(res.error);
                return;
              }
              toast({ variant: "success", title: "Outlet created" });
              setOpen(false);
              router.refresh();
            });
          }}
          className="grid grid-cols-2 gap-3"
        >
          <div>
            <Label>Name</Label>
            <Input name="name" required placeholder="Smokzy — Indiranagar" />
          </div>
          <div>
            <Label>Code</Label>
            <Input name="code" required placeholder="SMOKZY-02" />
          </div>
          <div className="col-span-2">
            <Label>Address</Label>
            <Input name="address" placeholder="100ft Road, Bengaluru" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input name="phone" />
          </div>
          <div>
            <Label>Email</Label>
            <Input name="email" type="email" />
          </div>
          <div>
            <Label>GSTIN</Label>
            <Input name="gstin" />
          </div>
          <div>
            <Label>FSSAI</Label>
            <Input name="fssai" />
          </div>
          {err && (
            <div className="col-span-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{err}</div>
          )}
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create outlet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SwitchOutletButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  if (active) {
    return (
      <Button variant="ghost" size="sm" disabled className="text-emerald-700">
        <Check className="h-4 w-4" /> Active
      </Button>
    );
  }
  return (
    <form
      action={async (fd) => {
        await switchOutlet(fd);
        toast({ variant: "success", title: "Switched outlet" });
        router.refresh();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="sm">
        Switch
      </Button>
    </form>
  );
}

export function DeactivateOutletButton({ id, name, disabled }: { id: string; name: string; disabled?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground"
      disabled={disabled || pending}
      title={disabled ? "Can't deactivate the last outlet" : `Deactivate ${name}`}
      onClick={() => {
        if (!confirm(`Deactivate ${name}? It hides from switchers but data is preserved.`)) return;
        const fd = new FormData();
        fd.append("id", id);
        startTransition(async () => {
          try {
            await deactivateOutlet(fd);
            toast({ variant: "destructive", title: `Deactivated ${name}` });
            router.refresh();
          } catch (e) {
            toast({ variant: "destructive", title: "Failed", description: String(e) });
          }
        });
      }}
    >
      <Power className="h-4 w-4" />
    </Button>
  );
}
