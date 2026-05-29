"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { inr } from "@/lib/utils";
import { Lock } from "lucide-react";
import { closeDay } from "../actions";

const DENOMS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

export function DenominationForm({
  businessDay,
  expectedCash,
  existing,
}: {
  businessDay: string;
  expectedCash: number;
  existing: { counted: number; variance: number; denominations: string; note: string } | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const initial: Record<number, number> = React.useMemo(() => {
    const m: Record<number, number> = {};
    for (const d of DENOMS) m[d] = 0;
    if (existing) {
      try {
        const parsed = JSON.parse(existing.denominations) as Record<string, number>;
        for (const [k, v] of Object.entries(parsed)) m[Number(k)] = v;
      } catch {}
    }
    return m;
  }, [existing]);
  const [counts, setCounts] = React.useState<Record<number, number>>(initial);
  const [note, setNote] = React.useState(existing?.note ?? "");
  const [pending, startTransition] = React.useTransition();

  const counted = DENOMS.reduce((s, d) => s + (counts[d] || 0) * d, 0);
  const variance = counted - expectedCash;
  const tolerance = 100;

  return (
    <form
      action={(fd) => {
        fd.set("businessDay", businessDay);
        fd.set("expectedCash", String(expectedCash));
        for (const d of DENOMS) fd.set(`d_${d}`, String(counts[d] || 0));
        fd.set("note", note);
        startTransition(async () => {
          try {
            await closeDay(fd);
            toast({ variant: "success", title: "Day-close saved", description: `Variance ${inr(variance)}` });
            router.refresh();
          } catch (e) {
            toast({ variant: "destructive", title: "Failed", description: String(e) });
          }
        });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {DENOMS.map((d) => (
          <label key={d} className="border rounded-md p-3 cursor-pointer">
            <div className="text-xs text-muted-foreground">₹{d}</div>
            <Input
              type="number"
              min="0"
              value={counts[d] ?? 0}
              onChange={(e) => setCounts((c) => ({ ...c, [d]: Math.max(0, Number(e.target.value) || 0) }))}
              className="mt-1 h-9 text-right"
            />
            <div className="text-[10px] text-muted-foreground mt-1">= {inr((counts[d] || 0) * d)}</div>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="border rounded-md p-3">
          <div className="text-xs text-muted-foreground">Expected</div>
          <div className="text-xl font-semibold">{inr(expectedCash)}</div>
        </div>
        <div className="border rounded-md p-3">
          <div className="text-xs text-muted-foreground">Counted</div>
          <div className="text-xl font-semibold">{inr(counted)}</div>
        </div>
        <div
          className={`border-2 rounded-md p-3 ${
            Math.abs(variance) <= tolerance
              ? "border-emerald-300 bg-emerald-50/40"
              : "border-rose-300 bg-rose-50/40"
          }`}
        >
          <div className="text-xs text-muted-foreground">Variance</div>
          <div
            className={`text-xl font-semibold ${
              Math.abs(variance) <= tolerance ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {variance >= 0 ? "+" : ""}
            {inr(variance)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {Math.abs(variance) <= tolerance ? "Within ₹100 tolerance" : "Outside tolerance — needs explanation"}
          </div>
        </div>
      </div>

      <div>
        <Label>Note</Label>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional: explain variance, mention shortages or excess"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          <Lock className="h-4 w-4" />
          {pending ? "Saving…" : existing ? "Update day-close" : "Close day"}
        </Button>
      </div>
    </form>
  );
}
