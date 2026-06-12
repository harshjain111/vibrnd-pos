"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Trash2, Plus, Send } from "lucide-react";
import { createRequisition } from "../actions";

type Dept = { id: string; name: string; kind: string };
type Rm = { id: string; name: string; unit: string; currentQty: number; parLevel: number };
type Line = { key: string; rawMaterialId: string; qty: string };

function newLine(): Line {
  return { key: Math.random().toString(36).slice(2), rawMaterialId: "", qty: "" };
}

type ChainSource = { id: string; name: string; kindBadge: string };

export function NewRequisitionForm({
  departments,
  defaultDepartmentId,
  lockDepartment,
  chainSources,
  rawMaterials,
}: {
  departments: Dept[];
  defaultDepartmentId: string | null;
  /** True for HOD roles — they can only raise FROM their owned dept. */
  lockDepartment: boolean;
  /** Chain locations the active outlet can pull from (BS / BK). Empty for
   *  HOD roles + outlets without chain linkage. */
  chainSources?: ChainSource[];
  rawMaterials: Rm[];
}) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [fromDepartmentId, setFromDepartmentId] = React.useState(defaultDepartmentId ?? "");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([newLine()]);
  /** "" = internal (own outlet's store), otherwise the supplier outlet id. */
  const [toOutletId, setToOutletId] = React.useState<string>("");
  const isChain = toOutletId !== "";

  const rmById = React.useMemo(() => new Map(rawMaterials.map((r) => [r.id, r])), [rawMaterials]);

  const addLine = () => setLines((ls) => [...ls, newLine()]);
  const removeLine = (key: string) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = () => {
    const cleaned = lines.filter((l) => l.rawMaterialId && Number(l.qty) > 0);
    if (cleaned.length === 0) {
      toast({ variant: "destructive", title: "Add at least one item with qty > 0" });
      return;
    }
    if (!fromDepartmentId) {
      toast({ variant: "destructive", title: "Pick a department" });
      return;
    }
    // Dedupe: same RM in two lines = sum.
    const merged = new Map<string, number>();
    for (const l of cleaned) {
      const prev = merged.get(l.rawMaterialId) ?? 0;
      merged.set(l.rawMaterialId, prev + Number(l.qty));
    }
    startTransition(async () => {
      try {
        await createRequisition({
          fromDepartmentId: isChain ? undefined : fromDepartmentId,
          toOutletId: isChain ? toOutletId : undefined,
          notes: notes || undefined,
          lines: Array.from(merged).map(([rawMaterialId, qty]) => {
            const rm = rmById.get(rawMaterialId);
            return { rawMaterialId, qty, unit: rm?.unit ?? "kg" };
          }),
        });
        // server redirects to detail; no toast needed
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't raise requisition", description: String(e) });
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Source picker — only when chain links exist */}
      {chainSources && chainSources.length > 0 && (
        <div>
          <Label>Pull supplies from</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1">
            <label
              className={`flex flex-col items-start gap-0.5 p-2 rounded-md border cursor-pointer ${
                toOutletId === "" ? "border-primary bg-primary/5" : "hover:bg-accent"
              }`}
            >
              <input
                type="radio"
                checked={toOutletId === ""}
                onChange={() => setToOutletId("")}
                className="sr-only"
              />
              <span className="font-medium text-sm">Own outlet's store</span>
              <span className="text-[10px] text-muted-foreground">Internal — same outlet, dept → store</span>
            </label>
            {chainSources.map((s) => (
              <label
                key={s.id}
                className={`flex flex-col items-start gap-0.5 p-2 rounded-md border cursor-pointer ${
                  toOutletId === s.id ? "border-primary bg-primary/5" : "hover:bg-accent"
                }`}
              >
                <input
                  type="radio"
                  checked={toOutletId === s.id}
                  onChange={() => setToOutletId(s.id)}
                  className="sr-only"
                />
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-sm">{s.name}</span>
                  <Badge variant="info" className="text-[9px]">{s.kindBadge}</Badge>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Chain — ships via transfer, confirm receipt
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Department picker — only for internal requisitions */}
      {!isChain && (
      <div className="max-w-md">
        <Label>Requesting department</Label>
        {lockDepartment ? (
          <div className="h-9 rounded-md border bg-muted/50 px-3 flex items-center text-sm">
            {departments.find((d) => d.id === fromDepartmentId)?.name ?? "—"}
            <Badge variant="outline" className="ml-2 text-[10px]">locked to your role</Badge>
          </div>
        ) : (
          <select
            value={fromDepartmentId}
            onChange={(e) => setFromDepartmentId(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Pick a department…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
      </div>
      )}

      {/* Line builder */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Items requested</Label>
          <Button type="button" variant="ghost" size="sm" onClick={addLine}>
            <Plus className="h-3.5 w-3.5" /> Add line
          </Button>
        </div>
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-2">Raw material</th>
                <th className="text-left p-2 w-28">Unit</th>
                <th className="text-right p-2 w-28">Qty needed</th>
                <th className="text-right p-2 w-32">In stock (outlet)</th>
                <th className="text-right p-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const rm = l.rawMaterialId ? rmById.get(l.rawMaterialId) : null;
                const low = rm && rm.currentQty < rm.parLevel;
                return (
                  <tr key={l.key} className="border-t">
                    <td className="p-2">
                      <select
                        value={l.rawMaterialId}
                        onChange={(e) => updateLine(l.key, { rawMaterialId: e.target.value })}
                        className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                      >
                        <option value="">Pick an item…</option>
                        {rawMaterials.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{rm?.unit ?? "—"}</td>
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.qty}
                        onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                        className="h-8 w-24 text-right ml-auto"
                      />
                    </td>
                    <td className="p-2 text-right text-xs">
                      {rm ? (
                        <span className={low ? "text-amber-700 font-medium" : "text-muted-foreground"}>
                          {rm.currentQty} {rm.unit}
                          {low && <span className="ml-1 text-[10px]">(low)</span>}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLine(l.key)}
                        disabled={lines.length === 1}
                        title="Remove line"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes */}
      <div>
        <Label>Notes for the store manager (optional)</Label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. needed for tomorrow's brunch service"
        />
      </div>

      {/* Submit */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t">
        <Button onClick={submit} disabled={pending}>
          <Send className="h-4 w-4" />
          {pending ? "Raising…" : "Send to store"}
        </Button>
      </div>
    </div>
  );
}
