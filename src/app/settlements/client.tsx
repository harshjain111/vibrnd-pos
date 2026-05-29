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
import { Receipt } from "lucide-react";
import { settleDue } from "./actions";
import { inr } from "@/lib/utils";

const MODES = ["CASH", "UPI", "CARD", "ONLINE", "WALLET"] as const;

export function SettleDialog({
  orderId,
  invoiceNo,
  balance,
  alreadyPaid,
  grandTotal,
}: {
  orderId: string;
  invoiceNo: string;
  balance: number;
  alreadyPaid: number;
  grandTotal: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<typeof MODES[number]>("CASH");
  const [amount, setAmount] = React.useState<number>(balance);
  const [pending, startTransition] = React.useTransition();

  const partial = amount > 0 && amount < balance;
  const exceeds = amount > balance + 0.01;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setAmount(balance);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Receipt className="h-3.5 w-3.5" />
          Settle
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settle {invoiceNo}</DialogTitle>
        </DialogHeader>
        <form
          action={(fd) => {
            fd.set("orderId", orderId);
            fd.set("paymentMode", mode);
            fd.set("amount", String(amount));
            startTransition(async () => {
              try {
                await settleDue(fd);
                toast({
                  variant: "success",
                  title: partial ? "Part-payment recorded" : "Bill settled",
                  description: `${inr(amount)} via ${mode}`,
                });
                setOpen(false);
                router.refresh();
              } catch (e) {
                toast({ variant: "destructive", title: "Settle failed", description: String(e) });
              }
            });
          }}
          className="space-y-3"
        >
          <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs space-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bill total</span>
              <span>{inr(grandTotal)}</span>
            </div>
            {alreadyPaid > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Already received</span>
                <span>− {inr(alreadyPaid)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-rose-700 border-t pt-1">
              <span>Balance owed</span>
              <span>{inr(balance)}</span>
            </div>
          </div>

          <div>
            <Label>Payment mode</Label>
            <div className="grid grid-cols-5 gap-1">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`text-[11px] px-1.5 py-1.5 rounded border ${
                    mode === m ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Amount to collect now (₹)</Label>
            <Input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={balance}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              required
              autoFocus
            />
            {partial && (
              <div className="text-xs text-amber-700 mt-1">
                Records as part-payment. Remaining {inr(balance - amount)} stays open.
              </div>
            )}
            {exceeds && (
              <div className="text-xs text-rose-700 mt-1">
                Amount exceeds balance ({inr(balance)}).
              </div>
            )}
          </div>

          <div>
            <Label>Note (optional)</Label>
            <Input name="note" placeholder="e.g. Bank deposit slip number" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || exceeds || amount <= 0}>
              {pending ? "Saving…" : partial ? `Record ${inr(amount)}` : `Settle ${inr(amount)}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
