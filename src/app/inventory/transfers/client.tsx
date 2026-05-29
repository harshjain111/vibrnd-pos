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
import { Plus, Trash2 } from "lucide-react";
import { createTransfer, receiveTransfer } from "./actions";

type Outlet = { id: string; name: string };
type RM = { id: string; name: string; unit: string; price: number };

type Line = { rawMaterialId: string; qty: number; unit: string; priceAtTransfer: number };

export function NewTransferDialog({
  children,
  outlets,
  rawMaterials,
  units,
}: {
  children: React.ReactNode;
  outlets: Outlet[];
  rawMaterials: RM[];
  units: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [receiverOutletId, setReceiverOutletId] = React.useState<string>(outlets[0]?.id ?? "");
  const [challanNo, setChallanNo] = React.useState("");
  const [transferDate, setTransferDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([{ rawMaterialId: "", qty: 0, unit: "", priceAtTransfer: 0 }]);
  const [pending, startTransition] = React.useTransition();

  const rmMap = React.useMemo(() => new Map(rawMaterials.map((r) => [r.id, r])), [rawMaterials]);

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const onSelectRm = (i: number, id: string) => {
    const rm = rmMap.get(id);
    updateLine(i, { rawMaterialId: id, unit: rm?.unit ?? "", priceAtTransfer: rm?.price ?? 0 });
  };

  const addLine = () => setLines((arr) => [...arr, { rawMaterialId: "", qty: 0, unit: "", priceAtTransfer: 0 }]);
  const removeLine = (i: number) => setLines((arr) => (arr.length === 1 ? arr : arr.filter((_, idx) => idx !== i)));

  const submit = () => {
    if (!receiverOutletId) {
      toast({ variant: "destructive", title: "Pick a receiving outlet" });
      return;
    }
    if (lines.some((l) => !l.rawMaterialId || l.qty <= 0)) {
      toast({ variant: "destructive", title: "Each line needs an RM and qty > 0" });
      return;
    }
    startTransition(async () => {
      try {
        await createTransfer({
          receiverOutletId,
          challanNo: challanNo || undefined,
          transferDate,
          notes: notes || undefined,
          lines: lines.map((l) => ({
            rawMaterialId: l.rawMaterialId,
            qty: l.qty,
            unit: l.unit,
            priceAtTransfer: l.priceAtTransfer,
          })),
        });
        toast({ variant: "success", title: "Transfer sent" });
        setOpen(false);
        setLines([{ rawMaterialId: "", qty: 0, unit: "", priceAtTransfer: 0 }]);
        router.refresh();
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't send", description: String(e) });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New transfer</DialogTitle>
          <DialogDescription>Stock at the sending outlet decrements on save. Receiver confirms quantities to apply at destination.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>To outlet</Label>
              <select value={receiverOutletId} onChange={(e) => setReceiverOutletId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
            </div>
            <div>
              <Label>Challan #</Label>
              <Input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} placeholder="auto" />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
          </div>
          <div className="border rounded-md p-2 space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  <Label className="text-xs">Raw material</Label>
                  <select value={l.rawMaterialId} onChange={(e) => onSelectRm(i, e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    <option value="">—</option>
                    {rawMaterials.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Qty</Label>
                  <Input type="number" step="0.01" value={l.qty} onChange={(e) => updateLine(i, { qty: Number(e.target.value) || 0 })} className="h-9" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Unit</Label>
                  <select value={l.unit} onChange={(e) => updateLine(i, { unit: e.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    <option value="">—</option>
                    {units.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Price ₹</Label>
                  <Input type="number" step="0.01" value={l.priceAtTransfer} onChange={(e) => updateLine(i, { priceAtTransfer: Number(e.target.value) || 0 })} className="h-9" />
                </div>
                <div className="col-span-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(i)} className="text-rose-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-4 w-4" />
              Add line
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>{pending ? "Sending…" : "Send"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReceiveBtn({
  transferId,
  lines,
}: {
  transferId: string;
  lines: { id: string; name: string; qtySent: number; unit: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [received, setReceived] = React.useState<Record<string, number>>(
    Object.fromEntries(lines.map((l) => [l.id, l.qtySent]))
  );
  const [pending, startTransition] = React.useTransition();
  const submit = () => {
    startTransition(async () => {
      try {
        await receiveTransfer({
          transferId,
          lines: lines.map((l) => ({ id: l.id, qtyReceived: received[l.id] ?? 0 })),
        });
        toast({ variant: "success", title: "Transfer received" });
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't receive", description: String(e) });
      }
    });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Receive</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive transfer</DialogTitle>
          <DialogDescription>Confirm the actual received quantity per line — variances are logged.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
              <div className="text-sm">
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-muted-foreground">Sent: {l.qtySent} {l.unit}</div>
              </div>
              <Input
                type="number"
                step="0.01"
                value={received[l.id] ?? 0}
                onChange={(e) => setReceived((r) => ({ ...r, [l.id]: Number(e.target.value) || 0 }))}
                className="h-8 w-24 text-right"
              />
              <span className="text-xs text-muted-foreground">{l.unit}</span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>{pending ? "Receiving…" : "Confirm receipt"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
