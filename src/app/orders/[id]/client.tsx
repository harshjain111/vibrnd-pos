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
import { XCircle, Printer, Split, Check, Gift, ArrowRightLeft, User, Ban, MoveRight, DoorClosed } from "lucide-react";
import {
  cancelOrder,
  reprintBill,
  splitBillByItem,
  compOrder,
  moveTable,
  moveOrderItems,
  changeCustomerName,
  voidOrderLine,
  closeTable,
} from "./actions";

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

/* ─────────────────────────────────────────────────────────────────────────
 * POS access-matrix actions (Move Table / Move Items / Change Customer /
 * Void). Each button is rendered only when the parent page has determined
 * the user's role permits it (gating happens server-side in canAccess but
 * we hide the buttons too so cashiers don't see clutter they can't use).
 * ──────────────────────────────────────────────────────────────────────── */

export function MoveTableButton({
  id,
  invoiceNo,
  currentTableName,
  tables,
}: {
  id: string;
  invoiceNo: string;
  currentTableName?: string | null;
  tables: { id: string; name: string; occupiedBy?: string | null }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [tableId, setTableId] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const submit = () => {
    if (!tableId) {
      toast({ variant: "destructive", title: "Pick a table" });
      return;
    }
    startTransition(async () => {
      try {
        await moveTable({ id, tableId });
        const target = tables.find((t) => t.id === tableId);
        toast({ variant: "success", title: `Moved ${invoiceNo}`, description: `Now on ${target?.name ?? "—"}` });
        setOpen(false);
        setTableId("");
        router.refresh();
      } catch (e: any) {
        toast({ variant: "destructive", title: "Move failed", description: String(e?.message ?? e) });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ArrowRightLeft className="h-4 w-4" />
          Move table
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {invoiceNo} to a new table</DialogTitle>
          <DialogDescription>
            Currently on <strong>{currentTableName ?? "no table"}</strong>. Tables already serving another bill are
            disabled.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
          {tables.map((t) => {
            const disabled = !!t.occupiedBy;
            const selected = t.id === tableId;
            return (
              <button
                key={t.id}
                type="button"
                disabled={disabled}
                onClick={() => setTableId(t.id)}
                className={
                  "rounded-md border p-3 text-sm transition-colors " +
                  (selected
                    ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                    : disabled
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:bg-accent")
                }
              >
                <div className="font-medium">{t.name}</div>
                {t.occupiedBy && <div className="text-[10px] text-muted-foreground mt-0.5">{t.occupiedBy}</div>}
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !tableId}>
            <MoveRight className="h-4 w-4" />
            {pending ? "Moving…" : "Move bill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MoveItemsButton({
  id,
  invoiceNo,
  items,
  targetOrders,
}: {
  id: string;
  invoiceNo: string;
  items: { id: string; name: string; qty: number; price: number; voided: boolean }[];
  targetOrders: { id: string; invoiceNo: string; tableName?: string | null }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [target, setTarget] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const toggle = (k: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const submit = () => {
    if (!target) {
      toast({ variant: "destructive", title: "Pick a destination bill" });
      return;
    }
    if (picked.size === 0) {
      toast({ variant: "destructive", title: "Pick at least one item" });
      return;
    }
    startTransition(async () => {
      try {
        const res = await moveOrderItems({ sourceOrderId: id, targetOrderId: target, itemIds: [...picked] });
        toast({ variant: "success", title: `Shifted ${res.moved} item${res.moved === 1 ? "" : "s"}` });
        setOpen(false);
        setPicked(new Set());
        setTarget("");
        router.refresh();
      } catch (e: any) {
        toast({ variant: "destructive", title: "Shift failed", description: String(e?.message ?? e) });
      }
    });
  };

  // Block the user when there's nowhere to send items.
  if (targetOrders.length === 0) {
    return (
      <Button variant="outline" size="sm" disabled title="No other running bills to receive items">
        <ArrowRightLeft className="h-4 w-4" />
        Shift items
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ArrowRightLeft className="h-4 w-4" />
          Shift items
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Shift items from {invoiceNo}</DialogTitle>
          <DialogDescription>Pick the destination bill, then tick the line items to move.</DialogDescription>
        </DialogHeader>
        <div>
          <Label>Destination</Label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Pick a running bill…</option>
            {targetOrders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.invoiceNo}
                {o.tableName ? ` · ${o.tableName}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="max-h-72 overflow-y-auto -mx-2 px-2 mt-2">
          <ul className="space-y-1">
            {items
              .filter((i) => !i.voided)
              .map((it) => {
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
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || picked.size === 0 || !target}>
            <ArrowRightLeft className="h-4 w-4" />
            {pending ? "Shifting…" : `Shift ${picked.size || ""} item${picked.size === 1 ? "" : "s"}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ChangeCustomerNameButton({
  id,
  invoiceNo,
  currentName,
  currentPhone,
}: {
  id: string;
  invoiceNo: string;
  currentName?: string | null;
  currentPhone?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(currentName ?? "");
  const [phone, setPhone] = React.useState(currentPhone ?? "");
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (open) {
      setName(currentName ?? "");
      setPhone(currentPhone ?? "");
    }
  }, [open, currentName, currentPhone]);

  const submit = () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Name is required" });
      return;
    }
    startTransition(async () => {
      try {
        await changeCustomerName({
          id,
          customerName: name.trim(),
          customerPhone: phone.trim() || undefined,
        });
        toast({ variant: "success", title: "Customer updated", description: `"${name.trim()}" on ${invoiceNo}` });
        setOpen(false);
        router.refresh();
      } catch (e: any) {
        toast({ variant: "destructive", title: "Update failed", description: String(e?.message ?? e) });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <User className="h-4 w-4" />
          Change customer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change customer on {invoiceNo}</DialogTitle>
          <DialogDescription>
            Updates the receipt-facing name + phone. Doesn't alter the linked customer record. Both old and new values
            land in the audit trail.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Walk-in" autoFocus />
          </div>
          <div>
            <Label>Phone (optional)</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VoidLineButton({
  orderId,
  lineId,
  lineName,
  qty,
}: {
  orderId: string;
  lineId: string;
  lineName: string;
  qty: number;
}) {
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
        await voidOrderLine({ id: orderId, lineId, reason: reason.trim() });
        toast({ variant: "success", title: `Voided ${lineName}`, description: "Stock reversed · audit trail captured" });
        setOpen(false);
        setReason("");
        router.refresh();
      } catch (e: any) {
        toast({ variant: "destructive", title: "Void failed", description: String(e?.message ?? e) });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          <Ban className="h-4 w-4" />
          Void
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Void {lineName} × {qty}?
          </DialogTitle>
          <DialogDescription>
            The line stays on the bill struck through, but no longer counts toward totals. Stock decremented by its
            recipe is reversed. Reason is required and goes to the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>
              Reason <span className="text-xs text-muted-foreground font-normal">— required</span>
            </Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Customer changed mind / wrong item / kitchen ran out"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={pending}>
            <Ban className="h-4 w-4" />
            {pending ? "Voiding…" : "Void item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/**
 * Final 'Close table' button (Box 4 of the POS spec image). Visible only
 * on a PAID dine-in bill whose table hasn't been explicitly released.
 * Stamps Order.closedAt and writes an audit row so an auditor can see
 * who released the table.
 */
export function CloseTableButton({
  id,
  invoiceNo,
  tableName,
}: {
  id: string;
  invoiceNo: string;
  tableName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();

  const submit = () => {
    startTransition(async () => {
      try {
        await closeTable({ id });
        toast({ variant: 'success', title: `Closed table ${tableName}`, description: `${invoiceNo} archived.` });
        router.refresh();
      } catch (e: any) {
        toast({ variant: 'destructive', title: 'Close failed', description: String(e?.message ?? e) });
      }
    });
  };

  return (
    <Button variant="outline" size="sm" onClick={submit} disabled={pending}>
      <DoorClosed className="h-4 w-4" />
      {pending ? 'Closing…' : 'Close table'}
    </Button>
  );
}
