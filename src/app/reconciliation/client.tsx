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
import { reconcileOrder } from "./actions";
import { inr } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

export function ReconcileDialog({
  orderId,
  invoiceNo,
  posAmount,
  existing,
  reconciledAt,
}: {
  orderId: string;
  invoiceNo: string;
  posAmount: number;
  existing: number | null;
  reconciledAt: Date | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState<number>(existing ?? posAmount);
  const [pending, startTransition] = React.useTransition();

  const diff = amount - posAmount;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={reconciledAt ? "ghost" : "outline"} size="sm">
          {reconciledAt ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Re-reconcile
            </>
          ) : (
            "Reconcile"
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reconcile {invoiceNo}</DialogTitle>
        </DialogHeader>
        <form
          action={(fd) => {
            fd.set("orderId", orderId);
            fd.set("reconciledAmount", String(amount));
            startTransition(async () => {
              try {
                await reconcileOrder(fd);
                toast({ variant: "success", title: "Reconciled", description: `${inr(amount)} (Δ ${inr(diff)})` });
                setOpen(false);
                router.refresh();
              } catch (e) {
                toast({ variant: "destructive", title: "Reconcile failed", description: String(e) });
              }
            });
          }}
          className="space-y-3"
        >
          <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs space-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">POS recorded</span>
              <span>{inr(posAmount)}</span>
            </div>
            {reconciledAt && (
              <div className="flex justify-between text-muted-foreground">
                <span>Previously reconciled</span>
                <span>{new Date(reconciledAt).toLocaleString("en-IN")}</span>
              </div>
            )}
          </div>
          <div>
            <Label>Aggregator payout (₹)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              required
              autoFocus
            />
            <div className={`text-xs mt-1 ${diff < 0 ? "text-rose-700" : diff > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
              Variance: {inr(diff)} {diff < 0 ? "(commission / chargeback)" : diff > 0 ? "(over-payment)" : ""}
            </div>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input name="note" placeholder="e.g. Settlement batch BAT-2026-05-28" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Mark reconciled"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
