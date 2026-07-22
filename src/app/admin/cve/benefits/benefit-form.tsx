"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineAlert } from "@/components/ui/inline-alert";
import { saveBenefitAction, type BenefitFormState } from "./actions";
import { BENEFIT_TYPES, WALLET_BUCKETS, type BenefitType } from "@/lib/cve/types";

export type ItemLite = { id: string; name: string };

export type BenefitInitial = {
  id: string;
  name: string;
  type: BenefitType;
  active: boolean;
  config: Record<string, unknown>;
};

/** Per-type field definitions. Rendering is data-driven so adding a new
 * benefit type only needs an entry here (plus a resolver + validator on
 * the server, which Phase 2 already dispatches on `type`). */
type FieldKind =
  | { kind: "number"; key: string; label: string; help?: string; step?: string; min?: number; max?: number }
  | { kind: "text"; key: string; label: string; help?: string }
  | { kind: "select"; key: string; label: string; options: { value: string; label: string }[]; help?: string }
  | { kind: "item"; key: string; label: string; help?: string };

const TYPE_LABELS: Record<BenefitType, string> = {
  WALLET_CREDIT: "Wallet credit",
  WALLET_CASHBACK: "Wallet cashback (% of bill)",
  PERCENT_DISCOUNT: "% discount",
  FLAT_DISCOUNT: "Flat ₹ discount",
  FREE_ITEM: "Free item",
  DAILY_ITEM: "Daily free item",
  WEEKLY_ITEM: "Weekly free item",
  MONTHLY_ITEM: "Monthly free item",
  REWARD_POINTS: "Reward points",
  BIRTHDAY_BENEFIT: "Birthday benefit",
  ANNIVERSARY_BENEFIT: "Anniversary benefit",
  PRIORITY_SEATING: "Priority seating",
  EXCLUSIVE_PRICING: "Exclusive pricing",
  FREE_DELIVERY: "Free delivery",
  ENTRY_WAIVER: "Entry fee waiver",
  CUSTOM: "Custom (info only)",
};

const BUCKET_OPTIONS = WALLET_BUCKETS.map((b) => ({ value: b, label: b }));
const APPLIES_OPTIONS = [
  { value: "BILL", label: "Whole bill" },
  { value: "CATEGORY", label: "Categories" },
  { value: "ITEM", label: "Specific items" },
];

const FIELD_MAP: Record<BenefitType, FieldKind[]> = {
  WALLET_CREDIT: [
    { kind: "number", key: "amount", label: "Amount (₹)", min: 1 },
    { kind: "select", key: "bucket", label: "Bucket", options: BUCKET_OPTIONS },
    { kind: "number", key: "expiresInDays", label: "Expires in (days)", help: "Blank = never expires", min: 1 },
  ],
  WALLET_CASHBACK: [
    { kind: "number", key: "percent", label: "% of bill", min: 0.1, max: 100, step: "0.1" },
    { kind: "number", key: "cap", label: "Cap (₹)", help: "Optional max credit per bill", min: 1 },
    { kind: "select", key: "bucket", label: "Bucket", options: BUCKET_OPTIONS },
    { kind: "number", key: "expiresInDays", label: "Expires in (days)", min: 1 },
  ],
  PERCENT_DISCOUNT: [
    { kind: "number", key: "percent", label: "% off", min: 0.1, max: 100, step: "0.1" },
    { kind: "number", key: "cap", label: "Cap (₹)", min: 1 },
    { kind: "select", key: "appliesTo", label: "Applies to", options: APPLIES_OPTIONS },
  ],
  FLAT_DISCOUNT: [
    { kind: "number", key: "amount", label: "Amount (₹)", min: 1 },
    { kind: "select", key: "appliesTo", label: "Applies to", options: APPLIES_OPTIONS },
  ],
  FREE_ITEM: [
    { kind: "item", key: "itemId", label: "Item" },
    { kind: "number", key: "qty", label: "Qty", min: 1 },
  ],
  DAILY_ITEM: [
    { kind: "item", key: "itemId", label: "Item" },
    { kind: "number", key: "qty", label: "Qty per day", min: 1 },
  ],
  WEEKLY_ITEM: [
    { kind: "item", key: "itemId", label: "Item" },
    { kind: "number", key: "qty", label: "Qty per week", min: 1 },
  ],
  MONTHLY_ITEM: [
    { kind: "item", key: "itemId", label: "Item" },
    { kind: "number", key: "qty", label: "Qty per month", min: 1 },
  ],
  REWARD_POINTS: [
    { kind: "select", key: "per", label: "Earn per", options: [
      { value: "BILL", label: "Per bill" },
      { value: "RUPEE", label: "Per rupee spent" },
    ] },
    { kind: "number", key: "points", label: "Points per bill", min: 1 },
    { kind: "number", key: "ratio", label: "Rupees per 1 point", help: "Used when 'per rupee spent'", min: 0.5 },
  ],
  BIRTHDAY_BENEFIT: [
    { kind: "number", key: "walletCredit", label: "Wallet credit (₹)", min: 1 },
    { kind: "item", key: "freeItemId", label: "Free item (optional)" },
    { kind: "text", key: "note", label: "Message shown at POS" },
  ],
  ANNIVERSARY_BENEFIT: [
    { kind: "number", key: "walletCredit", label: "Wallet credit (₹)", min: 1 },
    { kind: "item", key: "freeItemId", label: "Free item (optional)" },
    { kind: "text", key: "note", label: "Message shown at POS" },
  ],
  PRIORITY_SEATING: [{ kind: "text", key: "note", label: "Note" }],
  EXCLUSIVE_PRICING: [
    { kind: "text", key: "note", label: "Note" },
    // overrides array is authored via advanced JSON — dialog stays simple
  ],
  FREE_DELIVERY: [{ kind: "number", key: "value", label: "Notional value (₹)", help: "Used for reporting only", min: 0 }],
  ENTRY_WAIVER: [{ kind: "number", key: "amount", label: "Amount (₹)", min: 1 }],
  CUSTOM: [{ kind: "text", key: "note", label: "Note" }],
};

export function BenefitFormDialog({
  items,
  initial,
  trigger,
}: {
  items: ItemLite[];
  initial?: BenefitInitial;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<BenefitType>(initial?.type ?? "WALLET_CREDIT");
  const [cfg, setCfg] = React.useState<Record<string, string>>(() => configToStrings(initial?.config));
  const [advanced, setAdvanced] = React.useState(false);
  const [rawJson, setRawJson] = React.useState<string>(
    initial ? JSON.stringify(initial.config, null, 2) : "{}",
  );

  React.useEffect(() => {
    if (!open) return;
    setType(initial?.type ?? "WALLET_CREDIT");
    setCfg(configToStrings(initial?.config));
    setRawJson(initial ? JSON.stringify(initial.config, null, 2) : "{}");
    setAdvanced(false);
  }, [open, initial]);

  const fields = FIELD_MAP[type] ?? [];
  const configJson = React.useMemo(() => {
    if (advanced) return rawJson.trim() || "{}";
    return JSON.stringify(cfgFromForm(fields, cfg));
  }, [advanced, rawJson, fields, cfg]);

  const [state, formAction] = useFormState<BenefitFormState, FormData>(
    saveBenefitAction,
    null,
  );

  React.useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state?.ok]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit benefit" : "New benefit"}</DialogTitle>
          <DialogDescription>
            Benefits are the THEN side of a rule. Attach them to memberships or campaigns.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
          <input type="hidden" name="configJson" value={configJson} />

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={initial?.name ?? ""} required maxLength={80} />
            </div>
            <div>
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value as BenefitType)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm"
              >
                {BENEFIT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              name="active"
              defaultChecked={initial?.active ?? true}
              className="h-3.5 w-3.5"
            />
            Active
          </label>

          {!advanced ? (
            <div className="grid grid-cols-2 gap-2">
              {fields.map((f) => (
                <FieldRow
                  key={f.key}
                  field={f}
                  value={cfg[f.key] ?? ""}
                  items={items}
                  onChange={(v) => setCfg((prev) => ({ ...prev, [f.key]: v }))}
                />
              ))}
            </div>
          ) : (
            <div>
              <Label>Advanced JSON</Label>
              <textarea
                className="w-full font-mono text-xs rounded-md border p-2 min-h-[120px]"
                value={rawJson}
                onChange={(e) => setRawJson(e.target.value)}
              />
            </div>
          )}

          <div className="flex items-center justify-between text-[11px]">
            <button
              type="button"
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                if (!advanced) {
                  setRawJson(JSON.stringify(cfgFromForm(fields, cfg), null, 2));
                }
                setAdvanced((v) => !v);
              }}
            >
              {advanced ? "Simple fields" : "Advanced JSON"}
            </button>
            <span className="text-muted-foreground font-mono truncate max-w-[200px]" title={configJson}>
              {configJson}
            </span>
          </div>

          {state?.error ? <InlineAlert tone="bad">{state.error}</InlineAlert> : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitBtn label={initial ? "Save" : "Create"} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button size="sm" type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function FieldRow({
  field,
  value,
  items,
  onChange,
}: {
  field: FieldKind;
  value: string;
  items: ItemLite[];
  onChange: (v: string) => void;
}) {
  if (field.kind === "select") {
    return (
      <div>
        <Label>{field.label}</Label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
        >
          <option value="">Select…</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {field.help ? <div className="text-[10px] text-muted-foreground mt-0.5">{field.help}</div> : null}
      </div>
    );
  }
  if (field.kind === "item") {
    return (
      <div>
        <Label>{field.label}</Label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
        >
          <option value="">Select item…</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (field.kind === "text") {
    return (
      <div className="col-span-2">
        <Label>{field.label}</Label>
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
        {field.help ? <div className="text-[10px] text-muted-foreground mt-0.5">{field.help}</div> : null}
      </div>
    );
  }
  return (
    <div>
      <Label>{field.label}</Label>
      <Input
        type="number"
        inputMode="decimal"
        step={field.step ?? "1"}
        min={field.min}
        max={field.max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {field.help ? <div className="text-[10px] text-muted-foreground mt-0.5">{field.help}</div> : null}
    </div>
  );
}

// ─── serialisation helpers ─────────────────────────────────────────────

function configToStrings(cfg?: Record<string, unknown>): Record<string, string> {
  if (!cfg) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (v == null) continue;
    out[k] = String(v);
  }
  return out;
}

function cfgFromForm(fields: FieldKind[], strs: Record<string, string>): any {
  const out: any = {};
  for (const f of fields) {
    const raw = strs[f.key];
    if (raw == null || raw === "") continue;
    if (f.kind === "number") {
      const n = Number(raw);
      if (Number.isFinite(n)) out[f.key] = n;
    } else {
      out[f.key] = raw;
    }
  }
  return out;
}
