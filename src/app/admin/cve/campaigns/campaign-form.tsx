"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { CONDITION_TYPES, type ConditionType } from "@/lib/cve/types";
import { saveCampaign } from "./actions";

export type CampaignInitial = {
  id?: string;
  name: string;
  description: string;
  active: boolean;
  startsAt: string; // "YYYY-MM-DDTHH:mm"
  endsAt: string;
  priority: number;
  maxRedemptions: number | "";
  maxPerCustomer: number | "";
  rules: { conditionType: ConditionType; configJson: string; groupOp: "AND" | "OR" }[];
  benefits: { benefitDefId: string; overrideJson?: string }[];
};

export type BenefitDefLite = { id: string; name: string; type: string; active: boolean };
export type OutletLite = { id: string; name: string };
export type PlanLite = { id: string; name: string };

/** Human labels for the vocabulary. */
const CONDITION_LABEL: Record<ConditionType, string> = {
  CUSTOMER_TAG: "Has customer tag",
  MEMBERSHIP: "Membership",
  OUTLET: "Outlet",
  DATE_RANGE: "Date range / days of week",
  TIME_RANGE: "Time of day",
  BILL_AMOUNT: "Bill amount",
  VISIT_COUNT: "Visit count",
  GENDER: "Gender",
  BIRTHDAY: "Around birthday",
  ANNIVERSARY: "Around anniversary",
  CATEGORY_PURCHASED: "Category purchased",
  PRODUCT_PURCHASED: "Product purchased",
  PAYMENT_METHOD: "Payment method",
  FIRST_VISIT: "First visit",
  CUSTOM_FIELD: "Custom field",
};

/** Suggested skeleton configs per type — new rules seed with this so
 * admins can just tweak values. */
const SEED_CONFIG: Record<ConditionType, () => object> = {
  CUSTOMER_TAG: () => ({ op: "IN", values: [] }),
  MEMBERSHIP: () => ({ op: "ANY_ACTIVE", planIds: [] }),
  OUTLET: () => ({ op: "IN", outletIds: [] }),
  DATE_RANGE: () => ({ daysOfWeek: [] }),
  TIME_RANGE: () => ({ start: "12:00", end: "15:00" }),
  BILL_AMOUNT: () => ({ op: ">=", value: 500 }),
  VISIT_COUNT: () => ({ op: ">=", value: 1 }),
  GENDER: () => ({ op: "IN", values: [] }),
  BIRTHDAY: () => ({ withinDays: 3 }),
  ANNIVERSARY: () => ({ withinDays: 3 }),
  CATEGORY_PURCHASED: () => ({ op: "ANY_OF", categoryIds: [], minQty: 1 }),
  PRODUCT_PURCHASED: () => ({ op: "ANY_OF", itemIds: [], minQty: 1 }),
  PAYMENT_METHOD: () => ({ op: "IN", methods: ["UPI"] }),
  FIRST_VISIT: () => ({}),
  CUSTOM_FIELD: () => ({ key: "", op: "=", value: "" }),
};

export function CampaignForm({
  initial,
  benefits,
  outlets,
  plans,
}: {
  initial?: CampaignInitial;
  benefits: BenefitDefLite[];
  outlets: OutletLite[];
  plans: PlanLite[];
}) {
  const router = useRouter();
  const [state, setState] = React.useState<CampaignInitial>(() => initial ?? blankCampaign());
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const addRule = () => {
    setState((s) => ({
      ...s,
      rules: [
        ...s.rules,
        {
          conditionType: "BILL_AMOUNT",
          configJson: JSON.stringify(SEED_CONFIG.BILL_AMOUNT()),
          groupOp: "AND",
        },
      ],
    }));
  };
  const removeRule = (idx: number) =>
    setState((s) => ({ ...s, rules: s.rules.filter((_, i) => i !== idx) }));
  const updateRule = (idx: number, patch: Partial<CampaignInitial["rules"][number]>) =>
    setState((s) => ({
      ...s,
      rules: s.rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }));

  const addBenefit = (id: string) => {
    if (state.benefits.some((b) => b.benefitDefId === id)) return;
    setState((s) => ({ ...s, benefits: [...s.benefits, { benefitDefId: id }] }));
  };
  const removeBenefit = (id: string) =>
    setState((s) => ({ ...s, benefits: s.benefits.filter((b) => b.benefitDefId !== id) }));

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const payload = {
        ...state,
        maxRedemptions: state.maxRedemptions === "" ? null : Number(state.maxRedemptions),
        maxPerCustomer: state.maxPerCustomer === "" ? null : Number(state.maxPerCustomer),
      };
      const r = await saveCampaign(JSON.stringify(payload));
      if (!r.ok) {
        setError(r.error);
      } else {
        router.push("/admin/cve/campaigns");
      }
    } catch (err: any) {
      setError(err?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remainingBenefits = benefits.filter(
    (b) => !state.benefits.some((sb) => sb.benefitDefId === b.id) && b.active,
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Basics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={state.name}
              onChange={(e) => setState({ ...state, name: e.target.value })}
              maxLength={120}
              placeholder="e.g. Weekend flat 20% for members"
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={state.description}
              onChange={(e) => setState({ ...state, description: e.target.value })}
              rows={2}
              maxLength={400}
              placeholder="Internal note — what this campaign is meant to do"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="startsAt">Starts</Label>
              <Input
                id="startsAt"
                type="datetime-local"
                value={state.startsAt}
                onChange={(e) => setState({ ...state, startsAt: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="endsAt">Ends</Label>
              <Input
                id="endsAt"
                type="datetime-local"
                value={state.endsAt}
                onChange={(e) => setState({ ...state, endsAt: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                value={state.priority}
                onChange={(e) => setState({ ...state, priority: Number(e.target.value) || 0 })}
              />
              <div className="text-[10px] text-muted-foreground mt-0.5">Higher runs first.</div>
            </div>
            <div>
              <Label htmlFor="maxRedemptions">Max redemptions</Label>
              <Input
                id="maxRedemptions"
                type="number"
                value={state.maxRedemptions}
                onChange={(e) =>
                  setState({
                    ...state,
                    maxRedemptions: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
                placeholder="Unlimited"
              />
            </div>
            <div>
              <Label htmlFor="maxPerCustomer">Max per customer</Label>
              <Input
                id="maxPerCustomer"
                type="number"
                value={state.maxPerCustomer}
                onChange={(e) =>
                  setState({
                    ...state,
                    maxPerCustomer: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
                placeholder="Unlimited"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={state.active}
              onChange={(e) => setState({ ...state, active: e.target.checked })}
            />
            Active — eligible for redemption at POS
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Benefits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {state.benefits.length === 0 ? (
            <div className="text-xs text-muted-foreground">Attach at least one benefit.</div>
          ) : (
            state.benefits.map((b) => {
              const def = benefits.find((d) => d.id === b.benefitDefId);
              return (
                <div
                  key={b.benefitDefId}
                  className="rounded-md border p-2 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{def?.name ?? b.benefitDefId}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{def?.type}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeBenefit(b.benefitDefId)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })
          )}
          {remainingBenefits.length > 0 ? (
            <div className="pt-1">
              <Label>Add benefit</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value=""
                onChange={(e) => e.target.value && addBenefit(e.target.value)}
              >
                <option value="">Pick from registry…</option>
                {remainingBenefits.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.type})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">
              All registry benefits attached — create more in{" "}
              <a href="/admin/cve/benefits" className="underline">the registry</a>.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Rules</span>
            <Button size="sm" variant="outline" onClick={addRule}>
              <Plus className="h-3.5 w-3.5" /> Add rule
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {state.rules.length === 0 ? (
            <InlineAlert tone="info" className="text-xs">
              No rules — every customer at this outlet during the window qualifies. Add rules to
              narrow it.
            </InlineAlert>
          ) : (
            state.rules.map((r, i) => (
              <div key={i} className="rounded-md border p-2 space-y-2">
                <div className="flex items-center gap-2">
                  {i > 0 ? (
                    <select
                      className="h-8 rounded-md border bg-transparent px-2 text-xs font-semibold"
                      value={r.groupOp}
                      onChange={(e) =>
                        updateRule(i, { groupOp: e.target.value as "AND" | "OR" })
                      }
                    >
                      <option value="AND">AND</option>
                      <option value="OR">OR</option>
                    </select>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">WHERE</Badge>
                  )}
                  <select
                    className="h-8 flex-1 rounded-md border bg-transparent px-2 text-sm"
                    value={r.conditionType}
                    onChange={(e) => {
                      const t = e.target.value as ConditionType;
                      updateRule(i, {
                        conditionType: t,
                        configJson: JSON.stringify(SEED_CONFIG[t]()),
                      });
                    }}
                  >
                    {CONDITION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {CONDITION_LABEL[t]}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRule(i)}
                    className="text-muted-foreground hover:text-rose-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <RuleConfigEditor
                  type={r.conditionType}
                  configJson={r.configJson}
                  onChange={(v) => updateRule(i, { configJson: v })}
                  outlets={outlets}
                  plans={plans}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {error ? (
        <div className="lg:col-span-3">
          <InlineAlert tone="bad">{error}</InlineAlert>
        </div>
      ) : null}

      <div className="lg:col-span-3 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? "Saving…" : initial?.id ? "Save changes" : "Create campaign"}
        </Button>
      </div>
    </div>
  );
}

function RuleConfigEditor({
  type,
  configJson,
  onChange,
  outlets,
  plans,
}: {
  type: ConditionType;
  configJson: string;
  onChange: (v: string) => void;
  outlets: OutletLite[];
  plans: PlanLite[];
}) {
  const [advanced, setAdvanced] = React.useState(false);
  const cfg = safeParse(configJson);
  const setCfg = (patch: Record<string, unknown>) =>
    onChange(JSON.stringify({ ...cfg, ...patch }));

  const AdvancedToggle = (
    <button
      type="button"
      className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
      onClick={() => setAdvanced((v) => !v)}
    >
      {advanced ? "Simple fields" : "Advanced JSON"}
    </button>
  );

  if (advanced) {
    return (
      <div>
        <textarea
          className="w-full font-mono text-xs rounded-md border p-2 min-h-[80px]"
          value={configJson}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="mt-1 text-right">{AdvancedToggle}</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      {type === "CUSTOMER_TAG" && (
        <>
          <SelectOp
            value={String(cfg.op ?? "IN")}
            onChange={(op) => setCfg({ op })}
            options={["IN", "NOT_IN"]}
          />
          <StringList
            label="Tags"
            values={toStrArr(cfg.values)}
            onChange={(values) => setCfg({ values })}
            placeholder="VIP, BIRTHDAY_MONTH"
          />
        </>
      )}
      {type === "MEMBERSHIP" && (
        <>
          <SelectOp
            value={String(cfg.op ?? "HAS_ANY")}
            onChange={(op) => setCfg({ op })}
            options={["HAS_ANY", "HAS", "DOES_NOT_HAVE", "ANY_ACTIVE"]}
          />
          <MultiSelect
            label="Plans"
            options={plans.map((p) => ({ value: p.id, label: p.name }))}
            value={toStrArr(cfg.planIds)}
            onChange={(planIds) => setCfg({ planIds })}
          />
        </>
      )}
      {type === "OUTLET" && (
        <>
          <SelectOp
            value={String(cfg.op ?? "IN")}
            onChange={(op) => setCfg({ op })}
            options={["IN", "NOT_IN"]}
          />
          <MultiSelect
            label="Outlets"
            options={outlets.map((o) => ({ value: o.id, label: o.name }))}
            value={toStrArr(cfg.outletIds)}
            onChange={(outletIds) => setCfg({ outletIds })}
          />
        </>
      )}
      {type === "DATE_RANGE" && (
        <>
          <div>
            <Label>From</Label>
            <Input
              type="date"
              value={(cfg.from as string) ?? ""}
              onChange={(e) => setCfg({ from: e.target.value })}
            />
          </div>
          <div>
            <Label>To</Label>
            <Input
              type="date"
              value={(cfg.to as string) ?? ""}
              onChange={(e) => setCfg({ to: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <Label>Days of week</Label>
            <DaysOfWeekPicker
              value={toNumArr(cfg.daysOfWeek)}
              onChange={(daysOfWeek) => setCfg({ daysOfWeek })}
            />
          </div>
        </>
      )}
      {type === "TIME_RANGE" && (
        <>
          <div>
            <Label>Start</Label>
            <Input
              type="time"
              value={(cfg.start as string) ?? ""}
              onChange={(e) => setCfg({ start: e.target.value })}
            />
          </div>
          <div>
            <Label>End</Label>
            <Input
              type="time"
              value={(cfg.end as string) ?? ""}
              onChange={(e) => setCfg({ end: e.target.value })}
            />
          </div>
        </>
      )}
      {type === "BILL_AMOUNT" && (
        <>
          <SelectOp
            value={String(cfg.op ?? ">=")}
            onChange={(op) => setCfg({ op })}
            options={[">=", "<=", ">", "<", "=", "BETWEEN"]}
          />
          <div>
            <Label>Value</Label>
            <Input
              type="number"
              value={cfg.value != null ? Number(cfg.value) : ""}
              onChange={(e) => setCfg({ value: Number(e.target.value) })}
            />
          </div>
          {cfg.op === "BETWEEN" ? (
            <div className="col-span-2">
              <Label>Max value</Label>
              <Input
                type="number"
                value={cfg.valueMax != null ? Number(cfg.valueMax) : ""}
                onChange={(e) => setCfg({ valueMax: Number(e.target.value) })}
              />
            </div>
          ) : null}
        </>
      )}
      {type === "VISIT_COUNT" && (
        <>
          <SelectOp
            value={String(cfg.op ?? ">=")}
            onChange={(op) => setCfg({ op })}
            options={[">=", "<=", "=", "BETWEEN"]}
          />
          <div>
            <Label>Value</Label>
            <Input
              type="number"
              value={cfg.value != null ? Number(cfg.value) : ""}
              onChange={(e) => setCfg({ value: Number(e.target.value) })}
            />
          </div>
        </>
      )}
      {type === "GENDER" && (
        <>
          <SelectOp
            value={String(cfg.op ?? "IN")}
            onChange={(op) => setCfg({ op })}
            options={["IN", "NOT_IN"]}
          />
          <MultiSelect
            label="Values"
            options={[
              { value: "M", label: "Male" },
              { value: "F", label: "Female" },
              { value: "O", label: "Other" },
            ]}
            value={toStrArr(cfg.values)}
            onChange={(values) => setCfg({ values })}
          />
        </>
      )}
      {(type === "BIRTHDAY" || type === "ANNIVERSARY") && (
        <div>
          <Label>Within (days)</Label>
          <Input
            type="number"
            value={cfg.withinDays != null ? Number(cfg.withinDays) : ""}
            onChange={(e) => setCfg({ withinDays: Number(e.target.value) })}
          />
        </div>
      )}
      {type === "PAYMENT_METHOD" && (
        <>
          <SelectOp
            value={String(cfg.op ?? "IN")}
            onChange={(op) => setCfg({ op })}
            options={["IN", "NOT_IN"]}
          />
          <MultiSelect
            label="Methods"
            options={[
              { value: "CASH", label: "Cash" },
              { value: "CARD", label: "Card" },
              { value: "UPI", label: "UPI" },
              { value: "ONLINE", label: "Online" },
            ]}
            value={toStrArr(cfg.methods)}
            onChange={(methods) => setCfg({ methods })}
          />
        </>
      )}
      {(type === "CATEGORY_PURCHASED" || type === "PRODUCT_PURCHASED") && (
        <>
          <SelectOp
            value={String(cfg.op ?? "ANY_OF")}
            onChange={(op) => setCfg({ op })}
            options={["ANY_OF", "ALL_OF"]}
          />
          <div>
            <Label>Min qty</Label>
            <Input
              type="number"
              value={cfg.minQty != null ? Number(cfg.minQty) : 1}
              onChange={(e) => setCfg({ minQty: Number(e.target.value) })}
            />
          </div>
          <div className="col-span-2">
            <Label>{type === "CATEGORY_PURCHASED" ? "Category IDs" : "Item IDs"}</Label>
            <StringList
              values={toStrArr(
                cfg[type === "CATEGORY_PURCHASED" ? "categoryIds" : "itemIds"],
              )}
              onChange={(vals) =>
                setCfg({ [type === "CATEGORY_PURCHASED" ? "categoryIds" : "itemIds"]: vals })
              }
              placeholder="Paste ids comma-separated"
            />
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Advanced only for now — pickers land with the billing integration.
            </div>
          </div>
        </>
      )}
      {type === "FIRST_VISIT" && (
        <div className="col-span-2 text-[11px] text-muted-foreground">
          No config — fires when the customer&apos;s visit count is 0.
        </div>
      )}
      {type === "CUSTOM_FIELD" && (
        <>
          <div>
            <Label>Key</Label>
            <Input
              value={(cfg.key as string) ?? ""}
              onChange={(e) => setCfg({ key: e.target.value })}
            />
          </div>
          <div>
            <Label>Op</Label>
            <SelectOp
              value={String(cfg.op ?? "=")}
              onChange={(op) => setCfg({ op })}
              options={["=", "!=", "CONTAINS", "IN"]}
            />
          </div>
          <div className="col-span-2">
            <Label>Value</Label>
            <Input
              value={String(cfg.value ?? "")}
              onChange={(e) => setCfg({ value: e.target.value })}
            />
          </div>
        </>
      )}
      <div className="col-span-2 text-right">{AdvancedToggle}</div>
    </div>
  );
}

function SelectOp({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <Label>Op</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function StringList({
  values,
  onChange,
  placeholder,
  label,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div>
      {label ? <Label>{label}</Label> : null}
      <Input
        value={values.join(", ")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(/[,\n]/)
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
        placeholder={placeholder}
      />
    </div>
  );
}

function MultiSelect({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  label?: string;
}) {
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };
  return (
    <div>
      {label ? <Label>{label}</Label> : null}
      <div className="flex flex-wrap gap-1 border rounded-md p-1.5 min-h-9">
        {options.length === 0 ? (
          <span className="text-[11px] text-muted-foreground px-1">No options.</span>
        ) : (
          options.map((o) => {
            const on = value.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={
                  "rounded-full border px-2 py-0.5 text-[11px] transition-colors " +
                  (on ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")
                }
              >
                {o.label}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function DaysOfWeekPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (v: number[]) => void;
}) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const toggle = (idx: number) => {
    onChange(value.includes(idx) ? value.filter((v) => v !== idx) : [...value, idx].sort());
  };
  return (
    <div className="flex gap-1">
      {days.map((d, i) => {
        const on = value.includes(i);
        return (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            className={
              "flex-1 rounded-md border px-2 py-1 text-[11px] " +
              (on ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")
            }
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

// ─── seeds / parsing ───────────────────────────────────────────────────

export function blankCampaign(): CampaignInitial {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400_000);
  return {
    name: "",
    description: "",
    active: true,
    startsAt: toLocalInput(now),
    endsAt: toLocalInput(in30),
    priority: 0,
    maxRedemptions: "",
    maxPerCustomer: "",
    rules: [],
    benefits: [],
  };
}

function toLocalInput(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) ?? {};
  } catch {
    return {};
  }
}

function toStrArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x != null).map(String);
}
function toNumArr(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x != null).map(Number).filter((n) => Number.isFinite(n));
}
