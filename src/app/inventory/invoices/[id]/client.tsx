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
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Wallet } from "lucide-react";
import { recordVendorPayment } from "../actions";
import { inr } from "@/lib/utils";

export function RecordPaymentButton({ invoiceId, maxAmount }: { invoiceId: string; maxAmount: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState(String(Math.round(maxAmount)));
  const [mode, setMode] = React.useState<"BANK_TRANSFER" | "CASH" | "UPI" | "CARD" | "CHEQUE">("BANK_TRANSFER");
  const [reference, setReference] = React.useState("");
  const [occurredAt, setOccurredAt] = React.useState(new Date().toISOString().slice(0, 10));
  const [pending, startTransition] = React.useTransition();

  const submit = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast({ variant: "destructive", title: "Amount must be > 0" });
      return;
    }
    if (amt > maxAmount + 0.01) {
      toast({ variant: "destructive", title: `Cannot pay more than outstanding (${inr(Math.round(maxAmount))})` });
      return;
    }
    startTransition(async () => {
      try {
        await recordVendorPayment({
          invoiceId,
          amount: amt,
          mode,
          reference: reference || undefined,
          occurredAt,
        });
        toast({ variant: "success", title: "Payment recorded" });
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't record payment", description: String(e) });
      }
    });
  };

  return (
    <>
      <Button type="button" className="w-full" onClick={() => setOpen(true)}>
        <Wallet className="h-4 w-4" />
        Record payment
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record vendor payment</DialogTitle>
            <DialogDescription>
              Outstanding: <strong>{inr(Math.round(maxAmount))}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  max={maxAmount}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <Label>Mode</Label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as any)}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="UPI">UPI</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                </select>
              </div>
              <div>
                <Label>Reference</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="UTR / cheque #"
                />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={pending}>
              <Wallet className="h-4 w-4" />
              {pending ? "Recording…" : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function VerifyInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const submit = () => {
    startTransition(async () => {
      try {
        const { verifyVendorInvoice } = await import("../actions");
        await verifyVendorInvoice(invoiceId);
        toast({ variant: "success", title: "Invoice verified · cleared for payment" });
        router.refresh();
      } catch (e: any) {
        toast({ variant: "destructive", title: "Couldn't verify", description: e?.message ?? String(e) });
      }
    });
  };
  return (
    <Button onClick={submit} disabled={pending} size="sm">
      {pending ? "Verifying…" : "Verify & clear for payment"}
    </Button>
  );
}

export function ReviewVarianceButtons({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState<null | "VENDOR_MISTAKE" | "PRICE_INCREASE_VALID">(null);
  const [notes, setNotes] = React.useState("");

  const submit = (reason: "VENDOR_MISTAKE" | "PRICE_INCREASE_VALID") => {
    startTransition(async () => {
      try {
        const { reviewVendorInvoiceVariance } = await import("../actions");
        await reviewVendorInvoiceVariance({ invoiceId, reason, notes: notes || undefined });
        toast({
          variant: "success",
          title:
            reason === "PRICE_INCREASE_VALID"
              ? "Variance approved · cleared for payment"
              : "Invoice rejected · vendor must re-invoice",
        });
        setOpen(null);
        setNotes("");
        router.refresh();
      } catch (e: any) {
        toast({ variant: "destructive", title: "Couldn't submit review", description: e?.message ?? String(e) });
      }
    });
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          onClick={() => setOpen("VENDOR_MISTAKE")}
          disabled={pending}
          variant="outline"
          size="sm"
          className="border-rose-300 text-rose-700 hover:bg-rose-50"
        >
          1. Vendor mistake — reject
        </Button>
        <Button
          onClick={() => setOpen("PRICE_INCREASE_VALID")}
          disabled={pending}
          size="sm"
        >
          2. Price increase valid — approve
        </Button>
      </div>

      {/* Reason capture before final commit */}
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {open === "VENDOR_MISTAKE"
                ? "Reject — vendor mistake"
                : "Approve — valid price increase"}
            </DialogTitle>
            <DialogDescription>
              {open === "VENDOR_MISTAKE"
                ? "Send the invoice back to the vendor. They'll re-issue it with the corrected amount."
                : "Accept the variance — the vendor has a valid reason for the higher amount. Invoice will clear for payment."}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                open === "VENDOR_MISTAKE"
                  ? "e.g. Vendor billed for 30 units, only 25 received"
                  : "e.g. Supplier confirmed new rate effective this quarter"
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={() => open && submit(open)}
              disabled={pending}
              variant={open === "VENDOR_MISTAKE" ? "destructive" : "default"}
            >
              {pending ? "Submitting…" : open === "VENDOR_MISTAKE" ? "Reject invoice" : "Approve variance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
