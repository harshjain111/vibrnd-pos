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
import { fulfilRequisition } from "../../requisitions/actions";

export type RaiseGrnReq = {
  id: string;
  reqNo: string;
  raisedAtLabel: string;
  lines: { name: string; qtyApproved: number; unit: string }[];
};

/**
 * Dept-side counterpart to the SM's "Transfer to requester" button. Shown on
 * the department detail page so the dept lead can pull stock against an
 * approved requisition without bouncing to the requisitions screen.
 *
 * Picking a requisition shows the approved lines for confirmation; the
 * submit calls `fulfilRequisition` server-side — same path the SM uses, so
 * stock moves STORE → this dept atomically and the requisition flips to
 * FULFILLED.
 */
export function RaiseGrnButton({
  deptName,
  requisitions,
}: {
  deptName: string;
  requisitions: RaiseGrnReq[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pickedId, setPickedId] = React.useState<string>("");
  const [pending, startTransition] = React.useTransition();
  const picked = requisitions.find((r) => r.id === pickedId) ?? null;

  const reset = () => setPickedId("");

  const submit = () => {
    if (!picked) return;
    const fd = new FormData();
    fd.set("id", picked.id);
    startTransition(async () => {
      const res = await fulfilRequisition(fd);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't pull stock", description: res.error });
        return;
      }
      toast({
        variant: "success",
        title: `Stock moved to ${deptName}`,
        description: `${picked.reqNo} fulfilled.`,
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
          <DialogTitle>Raise GRN against a requisition</DialogTitle>
          <DialogDescription>
            Pull stock from store into <strong>{deptName}</strong> against one of your approved requisitions.
            Items + approved quantities are loaded from the requisition slip — review and confirm to apply.
          </DialogDescription>
        </DialogHeader>
        {requisitions.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            No approved requisitions for {deptName} yet.
            <br />
            Raise one first — the store manager approves, then come back here.
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Requisition</Label>
              <select
                value={pickedId}
                onChange={(e) => setPickedId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Pick a requisition…</option>
                {requisitions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.reqNo} · {r.lines.length} item(s) · raised {r.raisedAtLabel}
                  </option>
                ))}
              </select>
            </div>

            {picked && (
              <div className="rounded-md border bg-muted/30 p-2">
                <div className="text-xs text-muted-foreground mb-2">
                  Items in <strong>{picked.reqNo}</strong> (approved quantities):
                </div>
                <ul className="divide-y bg-background rounded">
                  {picked.lines.map((l, i) => (
                    <li key={i} className="px-2 py-1.5 flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{l.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {l.qtyApproved} {l.unit}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="text-[11px] text-muted-foreground mt-2">
                  On confirm, stock will be decremented from store and credited to {deptName}.
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
            {pending ? "Pulling…" : "Confirm + receive stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
