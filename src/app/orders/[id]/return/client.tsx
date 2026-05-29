"use client";
import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { inr } from "@/lib/utils";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { processReturn } from "./actions";

type Line = { id: string; name: string; qty: number; alreadyReturned: number; price: number };

const REFUND_MODES = ["CASH", "UPI", "CARD", "WALLET", "GIFT_CARD"] as const;
const COMMON_REASONS = ["Wrong item", "Item missing", "Spoiled", "Customer not satisfied", "Quality issue", "Cancelled after preparation", "Other"];

export function ReturnForm({ orderId, lines }: { orderId: string; lines: Line[] }) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [reason, setReason] = React.useState("");
  const [reasonPick, setReasonPick] = React.useState("Wrong item");
  const [refundMode, setRefundMode] = React.useState<typeof REFUND_MODES[number]>("CASH");
  const [picks, setPicks] = React.useState<Record<string, number>>({});

  const remaining = (l: Line) => l.qty - l.alreadyReturned;

  const setQty = (lineId: string, qty: number) => {
    setPicks((p) => {
      const next = { ...p };
      if (qty <= 0) delete next[lineId];
      else next[lineId] = qty;
      return next;
    });
  };

  const total = Math.round(
    Object.entries(picks).reduce((s, [id, q]) => {
      const li = lines.find((l) => l.id === id);
      return s + (li?.price ?? 0) * q;
    }, 0)
  );

  const submit = () => {
    const items = Object.entries(picks).map(([orderItemId, qty]) => ({ orderItemId, qty }));
    if (items.length === 0) {
      toast({ variant: "destructive", title: "Pick at least one line" });
      return;
    }
    const finalReason = reasonPick === "Other" ? reason.trim() : reasonPick + (reason.trim() ? ` · ${reason.trim()}` : "");
    if (finalReason.length < 3) {
      toast({ variant: "destructive", title: "Reason required" });
      return;
    }
    startTransition(async () => {
      try {
        await processReturn({
          orderId,
          reason: finalReason,
          refundMode,
          lines: items,
        });
        toast({ variant: "success", title: "Return processed", description: `${inr(total)} refunded ${refundMode}` });
      } catch (e) {
        toast({ variant: "destructive", title: "Return failed", description: String(e) });
      }
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {lines.map((l) => {
              const rem = remaining(l);
              const picked = picks[l.id] ?? 0;
              return (
                <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{l.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {inr(l.price)} × {l.qty}
                      {l.alreadyReturned > 0 && (
                        <span className="ml-2">
                          <Badge variant="warning" className="text-[10px]">
                            {l.alreadyReturned} already returned
                          </Badge>
                        </span>
                      )}
                    </div>
                  </div>
                  {rem === 0 ? (
                    <span className="text-xs text-muted-foreground">fully returned</span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => setQty(l.id, picked - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm">{picked}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => setQty(l.id, Math.min(rem, picked + 1))}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <span className="text-[10px] text-muted-foreground ml-1">/ {rem}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card className="lg:sticky lg:top-20 self-start">
        <CardHeader>
          <CardTitle>Refund details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Reason</Label>
            <select
              value={reasonPick}
              onChange={(e) => setReasonPick(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              {COMMON_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Detail (optional)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPick === "Other" ? "Required" : "Optional context"}
            />
          </div>
          <div>
            <Label>Refund mode</Label>
            <div className="grid grid-cols-5 gap-1">
              {REFUND_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setRefundMode(m)}
                  className={`text-[10px] uppercase px-1.5 py-1.5 rounded border ${refundMode === m ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
                >
                  {m === "GIFT_CARD" ? "GC" : m}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t pt-3 text-sm space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Items picked</span>
              <span>{Object.values(picks).reduce((s, n) => s + n, 0)}</span>
            </div>
            <div className="flex items-center justify-between text-base font-semibold pt-1.5 border-t">
              <span>Refund total</span>
              <span>{inr(total)}</span>
            </div>
          </div>

          <Button onClick={submit} disabled={pending || total === 0} variant="destructive" className="w-full" size="lg">
            <RotateCcw className="h-4 w-4" />
            {pending ? "Processing…" : `Refund ${inr(total)}`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
