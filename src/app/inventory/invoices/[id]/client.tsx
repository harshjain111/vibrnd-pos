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
