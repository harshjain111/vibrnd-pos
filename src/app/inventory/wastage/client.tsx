"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { recordWastage } from "./actions";

const COMMON_REASONS = ["Expired", "Spilled", "Burnt", "Spoiled", "Pest damage", "Customer return", "Cooking error"];

export function WastageForm({ rms }: { rms: { id: string; name: string; unit: string; currentQty: number }[] }) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [rmId, setRmId] = React.useState(rms[0]?.id ?? "");
  const [reason, setReason] = React.useState("Expired");

  if (rms.length === 0) {
    return <div className="text-sm text-muted-foreground">Add a raw material first.</div>;
  }

  const rm = rms.find((r) => r.id === rmId);

  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          await recordWastage(fd);
          toast({ variant: "warning", title: "Wastage recorded", description: `${rm?.name} · ${reason}` });
          // Reset just the qty/note
          (document.getElementById("wastage-qty") as HTMLInputElement)?.focus();
          (document.getElementById("wastage-form") as HTMLFormElement)?.reset();
          setReason("Expired");
        });
      }}
      id="wastage-form"
      className="space-y-3"
    >
      <div>
        <Label>Raw material</Label>
        <select
          name="rawMaterialId"
          value={rmId}
          onChange={(e) => setRmId(e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
        >
          {rms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} — {r.currentQty.toFixed(2)} {r.unit}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Quantity ({rm?.unit ?? ""})</Label>
          <Input id="wastage-qty" name="qty" type="number" step="0.01" min="0.01" required />
        </div>
        <div>
          <Label>Reason</Label>
          <select
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            {COMMON_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value="Other">Other (specify note)</option>
          </select>
        </div>
      </div>

      <div>
        <Label>Note (optional)</Label>
        <Input name="note" placeholder="Extra context for audit trail" />
      </div>

      <Button type="submit" variant="destructive" disabled={pending} className="w-full">
        {pending ? "Recording…" : "Record wastage"}
      </Button>
    </form>
  );
}
