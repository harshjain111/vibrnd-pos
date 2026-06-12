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
import { Power, Check, Network } from "lucide-react";
import { createOutlet, switchOutlet, deactivateOutlet, setOutletTopology } from "./actions";

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
          <div className="col-span-2">
            <Label>Chain topology kind</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {[
                { v: "OUTLET", label: "Outlet", desc: "Customer-facing restaurant" },
                { v: "BASE_STORE", label: "Base Store", desc: "Chain warehouse" },
                { v: "BASE_KITCHEN", label: "Base Kitchen", desc: "Central commissary" },
              ].map((k, i) => (
                <label
                  key={k.v}
                  className="flex flex-col items-start gap-0.5 p-2 rounded-md border cursor-pointer hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input
                    type="radio"
                    name="kind"
                    value={k.v}
                    defaultChecked={i === 0}
                    className="sr-only"
                  />
                  <span className="font-medium text-sm">{k.label}</span>
                  <span className="text-[10px] text-muted-foreground">{k.desc}</span>
                </label>
              ))}
            </div>
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

/**
 * Owner sets an outlet's chain topology: its kind plus which BS / BK it
 * pulls supplies from. BS and BK outlets clear those FKs (they don't have
 * upstream sources of their own).
 */
export function TopologyButton({
  outletId,
  outletName,
  currentKind,
  currentBaseStoreId,
  currentBaseKitchenId,
  availableBaseStores,
  availableBaseKitchens,
}: {
  outletId: string;
  outletName: string;
  currentKind: string;
  currentBaseStoreId: string | null;
  currentBaseKitchenId: string | null;
  availableBaseStores: { id: string; name: string }[];
  availableBaseKitchens: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState(currentKind);
  const [bsId, setBsId] = React.useState(currentBaseStoreId ?? "");
  const [bkId, setBkId] = React.useState(currentBaseKitchenId ?? "");
  const [pending, startTransition] = React.useTransition();

  const submit = () => {
    startTransition(async () => {
      const res = await setOutletTopology({
        id: outletId,
        kind: kind as any,
        baseStoreOutletId: kind === "OUTLET" && bsId ? bsId : undefined,
        baseKitchenOutletId: kind === "OUTLET" && bkId ? bkId : undefined,
      });
      if (res.error) {
        toast({ variant: "destructive", title: "Couldn't save topology", description: res.error });
        return;
      }
      toast({ variant: "success", title: "Topology updated" });
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setOpen(true)}
        title="Configure chain topology"
      >
        <Network className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Topology — {outletName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Outlet kind</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {[
                  { v: "OUTLET", label: "Outlet", desc: "POS + menu + billing" },
                  { v: "BASE_STORE", label: "Base Store", desc: "Chain warehouse" },
                  { v: "BASE_KITCHEN", label: "Base Kitchen", desc: "Commissary" },
                ].map((k) => (
                  <label
                    key={k.v}
                    className={`flex flex-col items-start gap-0.5 p-2 rounded-md border cursor-pointer ${
                      kind === k.v ? "border-primary bg-primary/5" : "hover:bg-accent"
                    }`}
                  >
                    <input
                      type="radio"
                      name="kindt"
                      value={k.v}
                      checked={kind === k.v}
                      onChange={() => setKind(k.v)}
                      className="sr-only"
                    />
                    <span className="font-medium text-sm">{k.label}</span>
                    <span className="text-[10px] text-muted-foreground">{k.desc}</span>
                  </label>
                ))}
              </div>
            </div>

            {kind === "OUTLET" && (
              <>
                <div>
                  <Label>Supplies from Base Store</Label>
                  <select
                    value={bsId}
                    onChange={(e) => setBsId(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">— None (procures direct from suppliers) —</option>
                    {availableBaseStores.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Receives from Base Kitchen</Label>
                  <select
                    value={bkId}
                    onChange={(e) => setBkId(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">— None (no central kitchen) —</option>
                    {availableBaseKitchens.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {kind !== "OUTLET" && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                {kind === "BASE_STORE"
                  ? "Base Stores receive purchases from suppliers and ship to outlets via requisition-driven transfers. The POS / Menu / Billing sidebar groups are hidden for users at this location."
                  : "Base Kitchens consume raw materials from their own STORE and produce semi-finished goods that ship to outlets. Production runs are scheduled by the Production Manager. POS / Menu / Billing are hidden."}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Save topology"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
