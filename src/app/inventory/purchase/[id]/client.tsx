"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Printer, Send, CheckCircle2, XCircle } from "lucide-react";
import { submitPO, ccApprovePO, ccRejectPO } from "../actions";

export function PrintPoButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      Print
    </Button>
  );
}

/** SM clicks this on a DRAFT PO. Copy adapts to whether the CC gate is on. */
export function SubmitForApprovalButton({ id, requiresCC }: { id: string; requiresCC: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <form
      action={async (fd) => {
        try {
          await submitPO(fd);
          toast({
            variant: "success",
            title: requiresCC ? "Sent for cost-control approval" : "Auto-approved",
            description: requiresCC
              ? "The Cost Controller will see this in their queue."
              : "CC gate is off in settings — you can mark it sent now.",
          });
          router.refresh();
        } catch (e) {
          toast({ variant: "destructive", title: "Couldn't submit", description: String(e) });
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm">
        <Send className="h-4 w-4" />
        {requiresCC ? "Submit for CC approval" : "Approve (no CC gate)"}
      </Button>
    </form>
  );
}

export function CcApproveButton({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <form
      action={async (fd) => {
        if (!confirm("Approve this PO? It can then be sent to the supplier.")) return;
        try {
          await ccApprovePO(fd);
          toast({ variant: "success", title: "PO approved" });
          router.refresh();
        } catch (e) {
          toast({ variant: "destructive", title: "Couldn't approve", description: String(e) });
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700">
        <CheckCircle2 className="h-4 w-4" />
        Approve PO
      </Button>
    </form>
  );
}

/** CC rejects with a required reason via modal dialog. */
export function CcRejectButton({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const submit = () => {
    if (reason.trim().length < 3) {
      toast({ variant: "destructive", title: "Please write a reason" });
      return;
    }
    const fd = new FormData();
    fd.set("id", id);
    fd.set("reason", reason.trim());
    startTransition(async () => {
      try {
        await ccRejectPO(fd);
        toast({ variant: "success", title: "PO rejected" });
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't reject", description: String(e) });
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="text-rose-700 hover:bg-rose-50"
        onClick={() => setOpen(true)}
      >
        <XCircle className="h-4 w-4" />
        Reject
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this PO</DialogTitle>
            <DialogDescription>
              The Store Manager will see your reason on the PO and in their notifications.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
              Reason
            </label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. unit price 25% above last quote — renegotiate"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={pending} className="bg-rose-600 hover:bg-rose-700">
              <XCircle className="h-4 w-4" />
              {pending ? "Rejecting…" : "Reject PO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
