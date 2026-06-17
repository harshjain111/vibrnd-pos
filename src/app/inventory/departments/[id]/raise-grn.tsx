"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { ClipboardCheck } from "lucide-react";
import { receiveInternalTransfer } from "../../requisitions/actions";

export type PendingTransfer = {
  id: string;
  label: string;
  sentAtLabel: string;
  lines: { name: string; qtySent: number; unit: string }[];
};

/**
 * Department-side receipt step. The store dispatched a requisition as an
 * INTERNAL transfer (status SENT); the dept lead "raises a GRN" against it
 * here to pull the stock in. Confirming calls `receiveInternalTransfer`,
 * which credits this department's ledger and flips the transfer to RECEIVED.
 */
export function RaiseGrnButton({
  deptName,
  transfers,
}: {
  deptName: string;
  transfers: PendingTransfer[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pickedId, setPickedId] = React.useState<string>("");
  const [pending, startTransition] = React.useTransition();
  const picked = transfers.find((t) => t.id === pickedId) ?? null;

  const reset = () => setPickedId("");

  const submit = () => {
    if (!picked) return;
    const fd = new FormData();
    fd.set("transferId", picked.id);
    startTransition(async () => {
      const res = await receiveInternalTransfer(fd);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't receive stock", description: res.error });
        return;
      }
      toast({
        variant: "success",
        title: `Stock received into ${deptName}`,
        description: `${picked.label} received.`,
      });
      setOpen(false);
      reset();
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ClipboardCheck className="h-4 w-4" />
          Raise GRN
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Receive a transfer into {deptName}</DialogTitle>
          <DialogDescription>
            Confirm a transfer the store has dispatched to <strong>{deptName}</strong>. The
            dispatched items + quantities are loaded from the transfer challan — review and
            confirm to add them to your department&apos;s stock.
          </DialogDescription>
        </DialogHeader>
        {transfers.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            No pending transfers for {deptName} yet.
            <br />
            Raise a requisition, the store manager approves and dispatches it from the
            Transfers tab, then it shows up here to receive.
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Transfer</Label>
              <select
                value={pickedId}
                onChange={(e) => setPickedId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Pick a transfer…</option>
                {transfers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} · {t.lines.length} item(s) · dispatched {t.sentAtLabel}
                  </option>
                ))}
              </select>
            </div>

            {picked && (
              <div className="rounded-md border bg-muted/30 p-2">
                <div className="text-xs text-muted-foreground mb-2">
                  Items in <strong>{picked.label}</strong> (dispatched quantities):
                </div>
                <ul className="divide-y bg-background rounded">
                  {picked.lines.map((l, i) => (
                    <li key={i} className="px-2 py-1.5 flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{l.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {l.qtySent} {l.unit}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="text-[11px] text-muted-foreground mt-2">
                  On confirm, these quantities are credited to {deptName}&apos;s stock.
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!picked || pending}>
            {pending ? "Receiving…" : "Confirm + receive stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
