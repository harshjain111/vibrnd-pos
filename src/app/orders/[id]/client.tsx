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
import { XCircle, Printer, Split, Check, Gift } from "lucide-react";
import { cancelOrder, reprintBill, splitBillByItem, compOrder } from "./actions";

export function CancelOrderButton({ id, invoiceNo }: { id: string; invoiceNo: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const submit = () => {
    startTransition(async () => {
      try {
        await cancelOrder({ id, reason: reason.trim() || undefined });
        toast({
          variant: "destructive",
          title: `Cancelled ${invoiceNo}`,
          description: reason || "Stock reversed, KOTs voided.",
        });
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast({ variant: "destructive", title: "Cancel failed", description: String(e) });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <XCircle className="h-4 w-4" />
          Cancel order
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {invoiceNo}?</DialogTitle>
          <DialogDescription>
            This voids the bill, cancels any active KOTs, and reverses recipe-based stock consumption. Capture a reason — it goes to the audit trail.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Reason</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Customer left / item out of stock / billing error"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Keep order
          </Button>
          <Button variant="destructive" onClick={submit} disabled={pending}>
            {pending ? "Cancelling…" : "Cancel order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Split a running bill into two by picking line items to move. The picked
 * lines spawn a new INV-…-S bill; the original keeps the rest. Audit TASK 11.
 */
export function SplitBillButton({
  id,
  invoiceNo,
  items,
}: {
  id: string;
  invoiceNo: string;
  items: { id: string; name: string; qty: number; price: number }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [pending, startTransition] = React.useTransition();

  const toggle = (lineId: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });

  const pickedTotal = items
    .filter((i) => picked.has(i.id))
    .reduce((s, i) => s + i.qty * i.price, 0);
  const remainingTotal = items.reduce((s, i) => s + i.qty * i.price, 0) - pickedTotal;

  const submit = () => {
    if (picked.size === 0) {
      toast({ variant: "destructive", title: "Pick at least one item" });
      return;
    }
    if (picked.size === items.length) {
      toast({ variant: "destructive", title: "Leave at least one item on the original bill" });
      return;
    }
    startTransition(async () => {
      try {
        const res = await splitBillByItem({ id, moveItemIds: [...picked] });
        toast({
          variant: "success",
          title: `Split into ${res.splitInvoice}`,
          description: `${picked.size} item(s) moved to a new bill.`,
        });
        setPicked(new Set());
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast({ variant: "destructive", title: "Split failed", description: String(e) });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Split className="h-4 w-4" />
          Split bill
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Split {invoiceNo}</DialogTitle>
          <DialogDescription>
            Pick the items that move to the new bill. The original keeps everything you leave un-ticked.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto -mx-2 px-2">
          <ul className="space-y-1">
            {items.map((it) => {
              const ticked = picked.has(it.id);
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => toggle(it.id)}
                    className={`w-full flex items-center justify-between gap-2 p-2 rounded-md border text-sm transition-colors ${
                      ticked ? "border-primary bg-primary/5" : "hover:bg-accent"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`h-4 w-4 rounded border grid place-items-center ${
                          ticked ? "bg-primary border-primary text-primary-foreground" : "border-input"
                        }`}
                      >
                        {ticked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="font-medium">{it.name}</span>
                      <span className="text-xs text-muted-foreground">× {it.qty}</span>
                    </span>
                    <span className="text-xs">₹{Math.round(it.qty * it.price).toLocaleString("en-IN")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm pt-2 border-t">
          <div className="rounded-md border bg-muted/30 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Original keeps</div>
            <div className="font-semibold">₹{Math.round(remainingTotal).toLocaleString("en-IN")}</div>
          </div>
          <div className="rounded-md border border-primary bg-primary/5 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-primary">New bill</div>
            <div className="font-semibold">₹{Math.round(pickedTotal).toLocaleString("en-IN")}</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || picked.size === 0}>
            <Split className="h-4 w-4" />
            {pending ? "Splitting…" : "Split bill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Mark order as complimentary (Sprint 2 acceptance gate). Zeroes grand total,
 * captures a mandatory reason, and counts as a leakage signal.
 */
export function CompOrderButton({ id, invoiceNo }: { id: string; invoiceNo: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const submit = () => {
    if (reason.trim().length < 3) {
      toast({ variant: "destructive", title: "Reason required" });
      return;
    }
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", id);
        fd.set("reason", reason.trim());
        await compOrder(fd);
        toast({ variant: "success", title: `${invoiceNo} marked complimentary`, description: "Audit trail captured." });
        setOpen(false);
        setReason("");
        router.refresh();
      } catch (e) {
        toast({ variant: "destructive", title: "Comp failed", description: String(e) });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-amber-700 border-amber-300 hover:bg-amber-50">
          <Gift className="h-4 w-4" />
          Comp
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Comp {invoiceNo}?</DialogTitle>
          <DialogDescription>
            Marks the bill as complimentary, zeroes the grand total. A reason is required and goes to the audit trail —
            this is tracked as a leakage signal.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Reason <span className="text-xs text-muted-foreground font-normal">— required</span></Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VIP guest / staff meal / service recovery"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            <Gift className="h-4 w-4" />
            {pending ? "Comping…" : "Mark complimentary"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Re-print bill with mandatory reason (audit TASK 10). Every reprint is logged
 * to the audit trail and bumps the order's `reprintCount` — surfaces as a
 * leakage signal on the dashboard.
 */
export function ReprintBillButton({ id, invoiceNo, count }: { id: string; invoiceNo: string; count: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const submit = () => {
    if (reason.trim().length < 3) {
      toast({ variant: "destructive", title: "Reason required", description: "Tell us why this bill is being re-printed." });
      return;
    }
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", id);
        fd.set("reason", reason.trim());
        await reprintBill(fd);
        // Window-print the receipt route in a new tab — leverages the existing
        // print-ready stylesheet at /billing/receipt/[id].
        window.open(`/billing/receipt/${id}`, "_blank");
        toast({ variant: "success", title: "Re-printed", description: "Captured in the audit trail." });
        setOpen(false);
        setReason("");
        router.refresh();
      } catch (e) {
        toast({ variant: "destructive", title: "Re-print failed", description: String(e) });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Printer className="h-4 w-4" />
          Re-print{count > 0 ? ` (${count}×)` : ""}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Re-print {invoiceNo}</DialogTitle>
          <DialogDescription>
            Re-prints are tracked as a leakage signal. Capture a reason so an auditor can review later.
            {count > 0 && (
              <span className="block mt-1 text-xs text-amber-700">
                Already re-printed {count} time{count === 1 ? "" : "s"}.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Reason <span className="text-xs text-muted-foreground font-normal">— required</span></Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Customer lost copy / printer jammed / GST detail wrong"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            <Printer className="h-4 w-4" />
            {pending ? "Re-printing…" : "Re-print bill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
