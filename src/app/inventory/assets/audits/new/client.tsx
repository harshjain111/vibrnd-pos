"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { ClipboardCheck } from "lucide-react";
import { submitAudit } from "../../actions";

type AssetRow = {
  id: string;
  name: string;
  category: string;
  location: string;
  qty: number;
  condition: string;
};

export function AuditForm({ assets }: { assets: AssetRow[] }) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [found, setFound] = React.useState<Record<string, string>>(
    Object.fromEntries(assets.map((a) => [a.id, String(a.qty)]))
  );
  const [conditions, setConditions] = React.useState<Record<string, string>>(
    Object.fromEntries(assets.map((a) => [a.id, a.condition]))
  );
  const [notes, setNotes] = React.useState("");

  const updateFound = (id: string, v: string) => setFound((s) => ({ ...s, [id]: v }));
  const updateCondition = (id: string, v: string) => setConditions((s) => ({ ...s, [id]: v }));

  const varianceCount = assets.reduce((acc, a) => {
    const f = Number(found[a.id] ?? "0");
    return Number.isFinite(f) && f !== a.qty ? acc + 1 : acc;
  }, 0);

  const submit = () => {
    startTransition(async () => {
      try {
        await submitAudit({
          notes: notes || undefined,
          lines: assets.map((a) => ({
            assetId: a.id,
            foundQty: Math.max(0, Number(found[a.id] ?? "0") || 0),
            conditionAfter:
              conditions[a.id] !== a.condition ? (conditions[a.id] as any) : undefined,
            note: undefined,
          })),
        });
        // server action redirects to detail page
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't save audit", description: String(e) });
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Asset</th>
              <th className="text-left p-2">Location</th>
              <th className="text-right p-2">Expected</th>
              <th className="text-right p-2">Found</th>
              <th className="text-right p-2">Δ</th>
              <th className="text-left p-2">Condition</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => {
              const f = Number(found[a.id] ?? "0");
              const variance = Number.isFinite(f) ? f - a.qty : 0;
              return (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="p-2">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {a.category}
                    </div>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">{a.location || "—"}</td>
                  <td className="p-2 text-right font-mono text-xs text-muted-foreground">{a.qty}</td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      min="0"
                      value={found[a.id] ?? ""}
                      onChange={(e) => updateFound(a.id, e.target.value)}
                      className="h-8 w-20 text-right ml-auto"
                    />
                  </td>
                  <td className="p-2 text-right">
                    {variance === 0 ? (
                      <Badge variant="success" className="text-[10px]">match</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px]">
                        {variance > 0 ? `+${variance}` : variance}
                      </Badge>
                    )}
                  </td>
                  <td className="p-2">
                    <select
                      value={conditions[a.id]}
                      onChange={(e) => updateCondition(a.id, e.target.value)}
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                    >
                      <option value="GOOD">Good</option>
                      <option value="FAIR">Fair</option>
                      <option value="DAMAGED">Damaged</option>
                      <option value="DISCARDED">Discarded</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
          Audit notes (optional)
        </label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Conducted with manager + auditor; CCTV reviewed for missing items"
        />
      </div>

      <div className="flex items-center justify-between pt-2 border-t">
        <div className="text-sm">
          {varianceCount > 0 ? (
            <Badge variant="destructive" className="text-[10px]">
              {varianceCount} variance{varianceCount === 1 ? "" : "s"}
            </Badge>
          ) : (
            <Badge variant="success" className="text-[10px]">All match</Badge>
          )}
        </div>
        <Button onClick={submit} disabled={pending || assets.length === 0}>
          <ClipboardCheck className="h-4 w-4" />
          {pending ? "Saving…" : "Submit audit"}
        </Button>
      </div>
    </div>
  );
}
