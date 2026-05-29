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
import { XCircle } from "lucide-react";
import { cancelOrder } from "./actions";

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
