"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Save, Trash2 } from "lucide-react";
import { saveSupplierRateCard } from "../../../actions";

type Rm = { id: string; name: string; unit: string };

type Row = {
  key: string;
  rawMaterialId: string;
  negotiatedRate: string;
  isPrimary: boolean;
};

function newRow(): Row {
  return {
    key: Math.random().toString(36).slice(2),
    rawMaterialId: "",
    negotiatedRate: "",
    isPrimary: false,
  };
}

export function RateCardEditor({
  supplierId,
  initialCreditDays,
  initialLines,
  rawMaterials,
}: {
  supplierId: string;
  initialCreditDays: number;
  initialLines: { rawMaterialId: string; negotiatedRate: number; isPrimary: boolean }[];
  rawMaterials: Rm[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [creditDays, setCreditDays] = React.useState(String(initialCreditDays));
  const [rows, setRows] = React.useState<Row[]>(() =>
    initialLines.length > 0
      ? initialLines.map((l) => ({
          key: Math.random().toString(36).slice(2),
          rawMaterialId: l.rawMaterialId,
          negotiatedRate: String(l.negotiatedRate),
          isPrimary: l.isPrimary,
        }))
      : [newRow()]
  );
  const [pending, startTransition] = React.useTransition();

  const rmById = React.useMemo(
    () => new Map(rawMaterials.map((r) => [r.id, r])),
    [rawMaterials]
  );

  // Items already on the card — used to filter the dropdown so the SM can't
  // duplicate a row by accident.
  const takenRmIds = React.useMemo(
    () => new Set(rows.map((r) => r.rawMaterialId).filter(Boolean)),
    [rows]
  );

  const updateRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, newRow()]);
  const removeRow = (key: string) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));

  const submit = () => {
    const cleaned = rows
      .filter((r) => r.rawMaterialId && Number(r.negotiatedRate) >= 0)
      .map((r) => ({
        rawMaterialId: r.rawMaterialId,
        negotiatedRate: Number(r.negotiatedRate),
        isPrimary: r.isPrimary,
      }));

    startTransition(async () => {
      const res = await saveSupplierRateCard({
        supplierId,
        creditDays: Number(creditDays) || 0,
        lines: cleaned,
      });
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Couldn't save rate card",
          description: res.error,
        });
        return;
      }
      toast({
        variant: "success",
        title: "Rate card saved",
        description: `${cleaned.length} item(s), ${Number(creditDays) || 0} day credit`,
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <div className="max-w-xs">
        <Label>Credit days</Label>
        <Input
          type="number"
          min="0"
          max="365"
          step="1"
          value={creditDays}
          onChange={(e) => setCreditDays(e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          0 = cash-on-delivery. Otherwise number of days the vendor lets you
          pay after the invoice date.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Items supplied + agreed rate</Label>
          <Button type="button" variant="ghost" size="sm" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" /> Add row
          </Button>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-2">Raw material</th>
                <th className="text-left p-2 w-20">Unit</th>
                <th className="text-right p-2 w-32">Rate ₹ / unit</th>
                <th className="text-center p-2 w-24">Primary</th>
                <th className="text-right p-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rm = r.rawMaterialId ? rmById.get(r.rawMaterialId) : null;
                return (
                  <tr key={r.key} className="border-t">
                    <td className="p-2">
                      <select
                        value={r.rawMaterialId}
                        onChange={(e) =>
                          updateRow(r.key, { rawMaterialId: e.target.value })
                        }
                        className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                      >
                        <option value="">Pick an item…</option>
                        {rawMaterials.map((opt) => {
                          // Allow the currently-picked one (so the row's own
                          // selection isn't filtered away), block dupes.
                          const blocked = takenRmIds.has(opt.id) && opt.id !== r.rawMaterialId;
                          return (
                            <option key={opt.id} value={opt.id} disabled={blocked}>
                              {opt.name}
                              {blocked ? " (already on card)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {rm?.unit ?? "—"}
                    </td>
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={r.negotiatedRate}
                        onChange={(e) =>
                          updateRow(r.key, { negotiatedRate: e.target.value })
                        }
                        className="h-8 w-28 text-right ml-auto"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={r.isPrimary}
                        onChange={(e) =>
                          updateRow(r.key, { isPrimary: e.target.checked })
                        }
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="p-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRow(r.key)}
                        disabled={rows.length === 1}
                        title="Remove row"
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
        <p className="text-[11px] text-muted-foreground mt-1">
          "Primary" marks the default supplier for that item — POs will
          auto-suggest this supplier when raising for the item.
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t">
        <Button onClick={submit} disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Saving…" : "Save rate card"}
        </Button>
      </div>
    </div>
  );
}
