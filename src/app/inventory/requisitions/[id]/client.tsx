"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { X, Check, AlertTriangle } from "lucide-react";
import { reviewRequisition, cancelRequisition } from "../actions";

type LineRow = {
  id: string;
  rawMaterialId: string;
  name: string;
  unit: string;
  qtyRequested: number;
  qtyApproved: number;
  declineReason: string | null;
  onHandAtStore: number;
};

/** SM's review form. One row per requested line. Defaults qtyApproved =
 *  qtyRequested so "Approve all" is a single click. Partials need a per-line
 *  reason; whole-decline needs an overall reason. */
export function ReviewForm({
  requisitionId,
  lines,
}: {
  requisitionId: string;
  lines: LineRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [state, setState] = React.useState(() =>
    lines.map((l) => ({
      id: l.id,
      qtyApproved: String(l.qtyRequested),
      declineReason: "",
    }))
  );
  const [notes, setNotes] = React.useState("");

  const setLine = (id: string, patch: Partial<(typeof state)[number]>) =>
    setState((s) => s.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const submit = (declineAll: boolean) => {
    startTransition(async () => {
      const res = await reviewRequisition({
        id: requisitionId,
        declineAll,
        notes: notes || undefined,
        lines: state.map((r) => ({
          lineId: r.id,
          qtyApproved: Math.max(0, Number(r.qtyApproved) || 0),
          declineReason: r.declineReason || undefined,
        })),
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't save review", description: res.error });
        return;
      }
      toast({
        variant: "success",
        title: declineAll ? "Requisition declined" : "Review saved",
      });
      router.refresh();
    });
  };

  return (
    <div>
      <table className="w-full text-sm">
        <thead className="bg-muted/40 border-y">
          <tr>
            <th className="text-left p-2">Item</th>
            <th className="text-right p-2 w-32">Requested</th>
            <th className="text-right p-2 w-32">In store</th>
            <th className="text-right p-2 w-32">Approve</th>
            <th className="text-left p-2 w-64">Reason if reducing</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const row = state.find((r) => r.id === l.id)!;
            const approving = Number(row.qtyApproved) || 0;
            const insufficient = approving > l.onHandAtStore;
            const reducing = approving > 0 && approving < l.qtyRequested;
            return (
              <tr key={l.id} className="border-b last:border-0">
                <td className="p-2 font-medium">{l.name}</td>
                <td className="p-2 text-right text-muted-foreground">
                  {l.qtyRequested} {l.unit}
                </td>
                <td className="p-2 text-right">
                  <span className={insufficient ? "text-rose-700 font-semibold" : "text-muted-foreground"}>
                    {l.onHandAtStore} {l.unit}
                    {insufficient && (
                      <AlertTriangle className="inline ml-1 h-3 w-3 align-text-bottom" />
                    )}
                  </span>
                </td>
                <td className="p-2 text-right">
                  <Input
                    type="number"
                    min="0"
                    max={l.qtyRequested}
                    step="0.01"
                    value={row.qtyApproved}
                    onChange={(e) => setLine(l.id, { qtyApproved: e.target.value })}
                    className={`h-8 w-24 text-right ml-auto ${insufficient ? "border-rose-400" : ""}`}
                  />
                </td>
                <td className="p-2">
                  <Input
                    value={row.declineReason}
                    onChange={(e) => setLine(l.id, { declineReason: e.target.value })}
                    placeholder={reducing ? "Required" : "Optional"}
                    className={reducing && !row.declineReason ? "border-amber-400" : ""}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="p-3 space-y-2 border-t bg-muted/20">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
            Overall notes (required if declining)
          </label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. butter shortage — supplier delivery rescheduled"
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => submit(true)}
            disabled={pending}
            className="text-rose-700 hover:bg-rose-50"
          >
            <X className="h-4 w-4" />
            Decline whole requisition
          </Button>
          <Button type="button" onClick={() => submit(false)} disabled={pending}>
            <Check className="h-4 w-4" />
            {pending ? "Approving…" : "Approve"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CancelButton({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <form
      action={async (fd) => {
        if (!confirm("Cancel this requisition?")) return;
        try {
          await cancelRequisition(fd);
          toast({ variant: "success", title: "Requisition cancelled" });
          router.refresh();
        } catch (e) {
          toast({ variant: "destructive", title: "Couldn't cancel", description: String(e) });
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="sm" className="text-rose-700 hover:bg-rose-50">
        <X className="h-4 w-4" />
        Cancel
      </Button>
    </form>
  );
}
