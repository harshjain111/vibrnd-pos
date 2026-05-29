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
import { XCircle, Printer } from "lucide-react";
import { cancelOrder, reprintBill } from "./actions";

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
