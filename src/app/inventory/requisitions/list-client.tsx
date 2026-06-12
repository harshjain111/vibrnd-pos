"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import {
  ChevronDown,
  ChevronRight,
  Check,
  X,
  AlertTriangle,
  ExternalLink,
  Truck,
} from "lucide-react";
import { reviewRequisition, fulfilRequisition } from "./actions";

export type RowLine = {
  id: string;
  name: string;
  unit: string;
  qtyRequested: number;
  qtyApproved: number;
  declineReason: string | null;
  /** Available at the SUPPLIER STORE department right now. Null when not
   *  applicable (non-pending rows). */
  onHandAtStore: number | null;
};

export type Row = {
  id: string;
  reqNo: string;
  status: string;
  createdAt: string;
  /** Pre-formatted "Kitchen" or "Smokzy BKC · Store" for cross-outlet. */
  fromLabel: string;
  direction: "INTERNAL" | "OUTBOUND_CHAIN" | "INBOUND";
  requesterName: string | null;
  notes: string | null;
  declineReason: string | null;
  lines: RowLine[];
};

/**
 * Expandable requisition rows. Click anywhere on a row (except the open
 * link) to expand inline; reviewers see the per-line approve / decline
 * form right there — no need to navigate to a detail page.
 */
export function RequisitionsTable({
  rows,
  canReview,
}: {
  rows: Row[];
  canReview: boolean;
}) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  return (
    <div>
      {/* Header row — matches the expanded layout below */}
      <div className="grid grid-cols-[28px_140px_1fr_80px_120px_110px] gap-2 px-3 py-2 text-xs font-medium border-b bg-muted/40 text-muted-foreground">
        <div></div>
        <div>Req #</div>
        <div>From</div>
        <div className="text-right">Lines</div>
        <div>Raised</div>
        <div>Status</div>
      </div>

      <ul className="divide-y">
        {rows.map((r) => {
          const isOpen = openId === r.id;
          return (
            <li key={r.id}>
              <RowHeader
                row={r}
                isOpen={isOpen}
                onToggle={() => setOpenId(isOpen ? null : r.id)}
              />
              {isOpen && (
                <ExpandedPanel
                  row={r}
                  canReview={canReview}
                  onDone={() => setOpenId(null)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RowHeader({
  row,
  isOpen,
  onToggle,
}: {
  row: Row;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const Chevron = isOpen ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full grid grid-cols-[28px_140px_1fr_80px_120px_110px] gap-2 px-3 py-2.5 text-sm text-left hover:bg-accent/40 transition-colors items-center"
    >
      <Chevron className="h-4 w-4 text-muted-foreground" />
      <span className="font-mono text-xs">{row.reqNo}</span>
      <span className="truncate">
        {row.direction === "INBOUND" && (
          <Badge variant="info" className="text-[9px] mr-1.5 align-middle">
            chain
          </Badge>
        )}
        {row.direction === "OUTBOUND_CHAIN" && (
          <Badge variant="warning" className="text-[9px] mr-1.5 align-middle">
            chain
          </Badge>
        )}
        {row.fromLabel}
      </span>
      <span className="text-right text-xs text-muted-foreground tabular-nums">
        {row.lines.length}
      </span>
      <span className="text-xs text-muted-foreground">
        {new Date(row.createdAt).toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
      <span>
        <StatusBadge status={row.status} />
      </span>
    </button>
  );
}

function ExpandedPanel({
  row,
  canReview,
  onDone,
}: {
  row: Row;
  canReview: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [state, setState] = React.useState(() =>
    row.lines.map((l) => ({
      id: l.id,
      // Default qtyApproved to qtyRequested when pending review; otherwise
      // mirror what's already on the record.
      qtyApproved: String(row.status === "NEW" ? l.qtyRequested : l.qtyApproved),
      declineReason: l.declineReason ?? "",
    }))
  );
  const [overallNotes, setOverallNotes] = React.useState("");
  const setLine = (id: string, patch: Partial<(typeof state)[number]>) =>
    setState((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const isReviewable = canReview && row.status === "NEW";
  const isFulfillable = canReview && (row.status === "APPROVED" || row.status === "PARTIAL");

  const submitReview = (declineAll: boolean) => {
    startTransition(async () => {
      const res = await reviewRequisition({
        id: row.id,
        declineAll,
        notes: overallNotes || undefined,
        lines: state.map((r) => ({
          lineId: r.id,
          qtyApproved: Math.max(0, Number(r.qtyApproved) || 0),
          declineReason: r.declineReason || undefined,
        })),
      });
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Couldn't save review",
          description: res.error,
        });
        return;
      }
      toast({
        variant: "success",
        title: declineAll ? "Requisition declined" : "Review saved",
      });
      onDone();
      router.refresh();
    });
  };

  const submitFulfil = () => {
    const fd = new FormData();
    fd.set("id", row.id);
    startTransition(async () => {
      const res = await fulfilRequisition(fd);
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Couldn't transfer",
          description: res.error,
        });
        return;
      }
      toast({ variant: "success", title: "Transferred to requester" });
      onDone();
      router.refresh();
    });
  };

  return (
    <div className="px-3 py-3 bg-muted/30 border-y space-y-3">
      {/* Header strip — requester + notes */}
      <div className="flex items-start justify-between gap-3 flex-wrap text-xs text-muted-foreground">
        <div className="space-y-0.5">
          {row.requesterName && <div>Raised by <span className="font-medium text-foreground">{row.requesterName}</span></div>}
          {row.notes && <div>Note: <span className="italic">{row.notes}</span></div>}
          {row.declineReason && (
            <div className="text-rose-700">Declined: {row.declineReason}</div>
          )}
        </div>
        <Link
          href={`/inventory/requisitions/${row.id}`}
          className="inline-flex items-center gap-1 text-[11px] underline-offset-2 hover:underline"
        >
          Open full detail <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Lines */}
      <div className="rounded-md border bg-background overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b">
            <tr>
              <th className="text-left p-2 font-medium">Item</th>
              <th className="text-right p-2 font-medium w-24">Requested</th>
              {isReviewable && <th className="text-right p-2 font-medium w-28">In store</th>}
              <th className="text-right p-2 font-medium w-28">
                {isReviewable ? "Approve" : "Approved"}
              </th>
              {isReviewable && <th className="text-left p-2 font-medium w-48">Reason if reducing</th>}
              {!isReviewable && row.lines.some((l) => l.declineReason) && (
                <th className="text-left p-2 font-medium w-48">Reason</th>
              )}
            </tr>
          </thead>
          <tbody>
            {row.lines.map((l) => {
              const rowState = state.find((r) => r.id === l.id)!;
              const approving = Number(rowState?.qtyApproved) || 0;
              const insufficient =
                isReviewable && l.onHandAtStore !== null && approving > l.onHandAtStore;
              const reducing = isReviewable && approving > 0 && approving < l.qtyRequested;
              return (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="p-2 font-medium">{l.name}</td>
                  <td className="p-2 text-right text-muted-foreground tabular-nums">
                    {l.qtyRequested} {l.unit}
                  </td>
                  {isReviewable && (
                    <td className="p-2 text-right tabular-nums">
                      <span className={insufficient ? "text-rose-700 font-semibold" : "text-muted-foreground"}>
                        {l.onHandAtStore?.toFixed?.(2) ?? "—"} {l.unit}
                        {insufficient && (
                          <AlertTriangle className="inline ml-1 h-3 w-3 align-text-bottom" />
                        )}
                      </span>
                    </td>
                  )}
                  <td className="p-2 text-right">
                    {isReviewable ? (
                      <Input
                        type="number"
                        min="0"
                        max={l.qtyRequested}
                        step="0.01"
                        value={rowState.qtyApproved}
                        onChange={(e) => setLine(l.id, { qtyApproved: e.target.value })}
                        className={`h-8 w-24 text-right ml-auto ${insufficient ? "border-rose-400" : ""}`}
                      />
                    ) : (
                      <span
                        className={`tabular-nums ${
                          l.qtyApproved === 0
                            ? "text-rose-700"
                            : l.qtyApproved < l.qtyRequested
                              ? "text-amber-700"
                              : "text-emerald-700"
                        } font-semibold`}
                      >
                        {l.qtyApproved} {l.unit}
                      </span>
                    )}
                  </td>
                  {isReviewable && (
                    <td className="p-2">
                      <Input
                        value={rowState.declineReason}
                        onChange={(e) => setLine(l.id, { declineReason: e.target.value })}
                        placeholder={reducing ? "Required" : "Optional"}
                        className={`h-8 ${reducing && !rowState.declineReason ? "border-amber-400" : ""}`}
                      />
                    </td>
                  )}
                  {!isReviewable && row.lines.some((l2) => l2.declineReason) && (
                    <td className="p-2 text-xs text-muted-foreground">{l.declineReason ?? "—"}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Action bar */}
      {(isReviewable || isFulfillable) && (
        <div className="flex flex-wrap items-end justify-between gap-2 pt-1">
          <div className="flex-1 min-w-[240px]">
            {isReviewable && (
              <>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">
                  Overall notes (required if declining)
                </label>
                <Input
                  value={overallNotes}
                  onChange={(e) => setOverallNotes(e.target.value)}
                  placeholder="e.g. butter shortage — supplier delivery rescheduled"
                />
              </>
            )}
          </div>
          <div className="flex gap-1.5 shrink-0">
            {isReviewable && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => submitReview(true)}
                  disabled={pending}
                  className="text-rose-700 hover:bg-rose-50"
                >
                  <X className="h-4 w-4" />
                  Decline whole
                </Button>
                <Button type="button" onClick={() => submitReview(false)} disabled={pending}>
                  <Check className="h-4 w-4" />
                  {pending ? "Saving…" : "Save review"}
                </Button>
              </>
            )}
            {isFulfillable && (
              <Button type="button" onClick={submitFulfil} disabled={pending}>
                <Truck className="h-4 w-4" />
                {pending ? "Transferring…" : "Transfer to requester"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: any; label: string }> = {
    NEW: { variant: "warning", label: "Pending" },
    APPROVED: { variant: "success", label: "Approved" },
    PARTIAL: { variant: "secondary", label: "Partial" },
    DECLINED: { variant: "destructive", label: "Declined" },
    FULFILLED: { variant: "success", label: "Fulfilled" },
    CANCELLED: { variant: "outline", label: "Cancelled" },
  };
  const cfg = map[status] ?? { variant: "outline", label: status };
  return (
    <Badge variant={cfg.variant} className="text-[10px]">
      {cfg.label}
    </Badge>
  );
}
