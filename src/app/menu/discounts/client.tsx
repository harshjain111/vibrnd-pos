"use client";
/**
 * Discount editor dialog — implements the full Vibrnd Discount Module
 * spec (C:\Users\ASUS\Desktop\Vibrnd_Discount_Module_Spec.md).
 *
 * Layout:
 *   • Tab 1 "Discount details" — title, type, channel, order types,
 *     value, min/max order, max discount, apply on, apply at,
 *     applicable scope, T&C, description.
 *   • Tab 2 "BOGO settings" — shown only when type=BOGO. Buy/Get
 *     scope, qtys, value, pricing strategy, free-qty toggle.
 *   • Tab 3 "Validity & code" — validation mode, code, date range,
 *     time window, days of week, active.
 *
 * The form is a single FormData submission so server-side validation can
 * see every field — no piecemeal mutations. The save action returns a
 * Result and we surface the error inline instead of crashing the dialog.
 */
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { saveDiscount } from "./actions";
import { useToast } from "@/components/ui/use-toast";

type DiscountType = "PERCENTAGE" | "FIXED" | "BOGO" | "FIXED_PRICE";

export type DiscountInit = {
  id?: string;
  title: string;
  code?: string | null;
  type: DiscountType | "FLAT" | "PERCENT";
  channel?: string;
  orderTypes?: string;
  value: number;
  minOrder?: number;
  maxOrder?: number | null;
  maxDiscount?: number | null;
  applyOn?: string;
  paymentMethods?: string | null;
  applyAt?: string;
  applicableScope?: string;
  applicableIds?: string | null;
  validationMode?: string;
  active: boolean;
  validFrom?: string | null;
  validTo?: string | null;
  timeFrom?: string | null;
  timeTo?: string | null;
  daysOfWeek?: string | null;
  description?: string | null;
  terms?: string | null;
  bogo?: {
    itemAmountMin?: number | null;
    buyScope?: string;
    buyScopeIds?: string | null;
    getScope?: string;
    getScopeIds?: string | null;
    buyQty?: number;
    getQty?: number;
    bogoValueType?: string;
    bogoValue?: number;
    getItemPricing?: string;
    buyItemPricing?: string;
    showFreeQtyOnPos?: boolean;
    buyAmountCap?: number | null;
  } | null;
};

type Option = { id: string; name: string };

const CHANNEL_OPTIONS = [
  { v: "POS", label: "POS" },
  { v: "ONLINE_PLATFORM", label: "Online Platform" },
  { v: "ZOMATO", label: "Zomato" },
  { v: "SWIGGY", label: "Swiggy" },
  { v: "KIOSK", label: "Kiosk" },
  { v: "GPAY", label: "GPay" },
  { v: "OS_AGGREGATOR", label: "OS Aggregator" },
  { v: "MR_DIVERT", label: "Mr Divert" },
  { v: "IRCTC", label: "IRCTC" },
];

const ORDER_TYPE_OPTIONS = [
  { v: "DELIVERY", label: "Delivery" },
  { v: "PICKUP", label: "Pickup" },
  { v: "DINE_IN", label: "Dine in" },
];

// Spec §1 field 9: payment method picker — keeps parity with the Settle
// drawer's tender options so a discount tagged to UPI here will trigger
// for the same key the cashier picks at settle.
const PAYMENT_METHODS = [
  { v: "CASH", label: "Cash" },
  { v: "CARD", label: "Card" },
  { v: "UPI", label: "UPI" },
  { v: "WALLET", label: "Wallet" },
  { v: "GIFT_CARD", label: "Gift Card" },
  { v: "LOYALTY", label: "Loyalty points" },
  { v: "BANK_TRANSFER", label: "Bank Transfer" },
];

const DOW = [
  { v: "MON", label: "Mon" },
  { v: "TUE", label: "Tue" },
  { v: "WED", label: "Wed" },
  { v: "THU", label: "Thu" },
  { v: "FRI", label: "Fri" },
  { v: "SAT", label: "Sat" },
  { v: "SUN", label: "Sun" },
];

function csvToSet(csv?: string | null): Set<string> {
  if (!csv) return new Set();
  return new Set(csv.split(",").map((s) => s.trim()).filter(Boolean));
}

function normaliseType(t: DiscountInit["type"]): DiscountType {
  if (t === "FLAT") return "FIXED";
  if (t === "PERCENT") return "PERCENTAGE";
  return t;
}

function toDateInput(d?: string | null) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.valueOf())) return "";
  return dt.toISOString().slice(0, 10);
}

/**
 * Compact multi-select rendered as a row of toggle chips. Petpooja-style
 * pickers use this pattern for channel / DOW / payment lists — the
 * single-click toggle is much faster than a multi-select dropdown for 7-9
 * options.
 */
function ChipMultiSelect({
  name,
  options,
  defaultValues,
  className,
}: {
  name: string;
  options: { v: string; label: string }[];
  defaultValues: Set<string>;
  className?: string;
}) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set(defaultValues));
  const toggle = (v: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };
  return (
    <div className={className ?? "flex flex-wrap gap-1.5"}>
      {options.map((o) => {
        const on = selected.has(o.v);
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => toggle(o.v)}
            className={
              "px-2.5 py-1 rounded-full text-xs border transition-colors " +
              (on
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-input hover:bg-accent")
            }
          >
            {o.label}
          </button>
        );
      })}
      {/* Hidden inputs so the FormData picks up the selected values without
          us having to wire JSON serialisation. We emit one input per
          checked value — getAll(name) reads them back as an array. */}
      {Array.from(selected).map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
      {selected.size === 0 && <input type="hidden" name={name} value="" />}
    </div>
  );
}

/**
 * Scope picker — when scope=CATEGORIES, show the category checkbox grid;
 * when scope=ITEMS, show items; when ALL, hide the picker entirely.
 */
function ScopePicker({
  scope,
  namePrefix,
  defaultIds,
  categories,
  items,
}: {
  scope: "ALL" | "CATEGORIES" | "ITEMS";
  namePrefix: string;
  defaultIds: Set<string>;
  categories: Option[];
  items: Option[];
}) {
  if (scope === "ALL") return null;
  const opts = scope === "CATEGORIES" ? categories : items;
  return (
    <div className="border rounded-md p-2 max-h-40 overflow-auto bg-muted/20">
      {opts.length === 0 ? (
        <div className="text-xs text-muted-foreground p-2">
          No {scope === "CATEGORIES" ? "categories" : "items"} found in this outlet
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1">
          {opts.map((o) => (
            <label key={o.id} className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                name={namePrefix}
                value={o.id}
                defaultChecked={defaultIds.has(o.id)}
              />
              <span className="truncate">{o.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function DiscountDialog({
  children,
  initial,
  categories,
  items,
}: {
  children: React.ReactNode;
  initial?: DiscountInit;
  categories: Option[];
  items: Option[];
}) {
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const { toast } = useToast();
  const initType = initial ? normaliseType(initial.type) : "PERCENTAGE";
  const [type, setType] = React.useState<DiscountType>(initType);
  const [applyOn, setApplyOn] = React.useState(initial?.applyOn ?? "AMOUNT");
  const [applicableScope, setApplicableScope] = React.useState<"ALL" | "CATEGORIES" | "ITEMS">(
    (initial?.applicableScope as any) ?? "ALL"
  );
  const [validationMode, setValidationMode] = React.useState(initial?.validationMode ?? "NONE");
  const [buyScope, setBuyScope] = React.useState<"ALL" | "CATEGORIES" | "ITEMS">(
    (initial?.bogo?.buyScope as any) ?? "ALL"
  );
  const [getScope, setGetScope] = React.useState<"ALL" | "CATEGORIES" | "ITEMS">(
    (initial?.bogo?.getScope as any) ?? "ALL"
  );

  // Reset transient state when dialog reopens.
  React.useEffect(() => {
    if (open) {
      setType(initType);
      setApplyOn(initial?.applyOn ?? "AMOUNT");
      setApplicableScope((initial?.applicableScope as any) ?? "ALL");
      setValidationMode(initial?.validationMode ?? "NONE");
      setBuyScope((initial?.bogo?.buyScope as any) ?? "ALL");
      setGetScope((initial?.bogo?.getScope as any) ?? "ALL");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const initOrderTypes = csvToSet(initial?.orderTypes ?? "DELIVERY,PICKUP,DINE_IN");
  const initPayMethods = csvToSet(initial?.paymentMethods);
  const initDow = csvToSet(initial?.daysOfWeek);
  const initApplicable = csvToSet(initial?.applicableIds);
  const initBuyIds = csvToSet(initial?.bogo?.buyScopeIds);
  const initGetIds = csvToSet(initial?.bogo?.getScopeIds);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit discount" : "Add discount"}</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            setSaving(true);
            try {
              const res = await saveDiscount(fd);
              if (res.ok) {
                toast({ variant: "success", title: "Discount saved" });
                setOpen(false);
              } else {
                toast({ variant: "destructive", title: "Couldn't save", description: res.error || "Save failed" });
              }
            } finally {
              setSaving(false);
            }
          }}
        >
          {initial?.id && <input type="hidden" name="id" value={initial.id} />}
          <Tabs defaultValue="details">
            <TabsList className="mb-3 w-full grid grid-cols-3">
              <TabsTrigger value="details">Discount details</TabsTrigger>
              <TabsTrigger value="bogo" disabled={type !== "BOGO"}>
                BOGO settings
              </TabsTrigger>
              <TabsTrigger value="validity">Validity & code</TabsTrigger>
            </TabsList>

            {/* ───────── TAB 1: Discount details ─────────────────── */}
            <TabsContent value="details" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Title *</Label>
                  <Input
                    name="title"
                    defaultValue={initial?.title}
                    placeholder="e.g. Independence Day 25% off"
                    required
                  />
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Shown to staff and on the printed bill.
                  </p>
                </div>

                <div>
                  <Label>Discount type *</Label>
                  <select
                    name="type"
                    value={type}
                    onChange={(e) => setType(e.target.value as DiscountType)}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="FIXED">Fixed amount (₹ off)</option>
                    <option value="BOGO">Buy one get one (BOGO)</option>
                    <option value="FIXED_PRICE">Fixed price (cap to ₹)</option>
                  </select>
                </div>

                <div>
                  <Label>Channel *</Label>
                  <select
                    name="channel"
                    defaultValue={initial?.channel ?? "POS"}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    disabled={!!initial?.id}
                  >
                    {CHANNEL_OPTIONS.map((c) => (
                      <option key={c.v} value={c.v}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {initial?.id && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Channel is sticky after first save.
                    </p>
                  )}
                </div>

                <div className="col-span-2">
                  <Label>Order types *</Label>
                  <ChipMultiSelect
                    name="orderTypes"
                    options={ORDER_TYPE_OPTIONS}
                    defaultValues={initOrderTypes}
                  />
                </div>

                {/* Value — relabelled per type. BOGO shows the bogoValue
                    on its own tab so the field here is dimmed. */}
                {type !== "BOGO" && (
                  <div>
                    <Label>
                      {type === "PERCENTAGE"
                        ? "Discount % *"
                        : type === "FIXED"
                        ? "Discount ₹ *"
                        : "Fixed price (₹) *"}
                    </Label>
                    <Input
                      name="value"
                      type="number"
                      step="0.01"
                      min="0"
                      max={type === "PERCENTAGE" ? "100" : undefined}
                      defaultValue={initial?.value ?? (type === "PERCENTAGE" ? 10 : 50)}
                      required
                    />
                  </div>
                )}

                {type === "PERCENTAGE" && (
                  <div>
                    <Label>Max discount cap (₹)</Label>
                    <Input
                      name="maxDiscount"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={initial?.maxDiscount ?? ""}
                      placeholder="Leave blank for no cap"
                    />
                  </div>
                )}

                <div>
                  <Label>Min order amount (₹)</Label>
                  <Input
                    name="minOrder"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={initial?.minOrder ?? 0}
                  />
                </div>
                <div>
                  <Label>Max order amount (₹)</Label>
                  <Input
                    name="maxOrder"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={initial?.maxOrder ?? ""}
                    placeholder="Leave blank for no cap"
                  />
                </div>

                <div>
                  <Label>Apply on *</Label>
                  <select
                    name="applyOn"
                    value={applyOn}
                    onChange={(e) => setApplyOn(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="AMOUNT">Amount</option>
                    <option value="PAYMENT_TYPE">Payment type</option>
                  </select>
                </div>

                <div>
                  <Label>Apply at *</Label>
                  <select
                    name="applyAt"
                    defaultValue={initial?.applyAt ?? "CORE"}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="CORE">Core (pre-tax subtotal)</option>
                    <option value="TOTAL">Total (post-tax)</option>
                  </select>
                </div>

                {applyOn === "PAYMENT_TYPE" && (
                  <div className="col-span-2">
                    <Label>Payment methods *</Label>
                    <ChipMultiSelect
                      name="paymentMethods"
                      options={PAYMENT_METHODS}
                      defaultValues={initPayMethods}
                    />
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Discount only fires when the cashier picks one of these methods.
                    </p>
                  </div>
                )}

                <div className="col-span-2">
                  <Label>Applicable to *</Label>
                  <div className="flex gap-2 mb-2">
                    {(["ALL", "CATEGORIES", "ITEMS"] as const).map((s) => (
                      <label key={s} className="inline-flex items-center gap-1.5 text-sm">
                        <input
                          type="radio"
                          name="applicableScope"
                          value={s}
                          checked={applicableScope === s}
                          onChange={() => setApplicableScope(s)}
                        />
                        {s === "ALL" ? "All items" : s === "CATEGORIES" ? "Specific categories" : "Specific items"}
                      </label>
                    ))}
                  </div>
                  <ScopePicker
                    scope={applicableScope}
                    namePrefix="applicableIds"
                    defaultIds={initApplicable}
                    categories={categories}
                    items={items}
                  />
                </div>

                <div className="col-span-2">
                  <Label>Description (internal)</Label>
                  <Textarea
                    name="description"
                    defaultValue={initial?.description ?? ""}
                    placeholder="Short note for staff — not shown on the bill."
                    rows={2}
                  />
                </div>

                <div className="col-span-2">
                  <Label>Terms & conditions</Label>
                  <Textarea
                    name="terms"
                    defaultValue={initial?.terms ?? ""}
                    placeholder="Printed on the bill. e.g. Not valid with other offers."
                    rows={3}
                  />
                </div>
              </div>
            </TabsContent>

            {/* ───────── TAB 2: BOGO settings ───────────────────── */}
            <TabsContent value="bogo" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  BOGO rules: customer buys items from the <strong>Buy</strong> side and gets the matching
                  count of items from the <strong>Get</strong> side at a discount.
                </div>

                <div className="col-span-2">
                  <Label>Min item amount (₹)</Label>
                  <Input
                    name="bogo.itemAmountMin"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={initial?.bogo?.itemAmountMin ?? ""}
                    placeholder="Floor on the qualifying cart total"
                  />
                </div>

                <div>
                  <Label>Buy quantity</Label>
                  <Input
                    name="bogo.buyQty"
                    type="number"
                    min="1"
                    defaultValue={initial?.bogo?.buyQty ?? 1}
                  />
                </div>
                <div>
                  <Label>Get quantity</Label>
                  <Input
                    name="bogo.getQty"
                    type="number"
                    min="1"
                    defaultValue={initial?.bogo?.getQty ?? 1}
                  />
                </div>

                <div>
                  <Label>Bogo value type</Label>
                  <select
                    name="bogo.bogoValueType"
                    defaultValue={initial?.bogo?.bogoValueType ?? "PERCENTAGE"}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="PERCENTAGE">% off on Get item</option>
                    <option value="FIXED">₹ off on Get item</option>
                  </select>
                </div>
                <div>
                  <Label>Bogo value</Label>
                  <Input
                    name="bogo.bogoValue"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={initial?.bogo?.bogoValue ?? 100}
                  />
                </div>

                <div>
                  <Label>Get-item pricing</Label>
                  <select
                    name="bogo.getItemPricing"
                    defaultValue={initial?.bogo?.getItemPricing ?? "LOWER"}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="LOWER">Lower-priced first (best for guest)</option>
                    <option value="HIGHER">Higher-priced first</option>
                    <option value="SAME">Same as Buy item</option>
                  </select>
                </div>
                <div>
                  <Label>Buy-item pricing</Label>
                  <select
                    name="bogo.buyItemPricing"
                    defaultValue={initial?.bogo?.buyItemPricing ?? "LOWER"}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="LOWER">Lower-priced first</option>
                    <option value="HIGHER">Higher-priced first</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <Label>Buy amount cap (₹)</Label>
                  <Input
                    name="bogo.buyAmountCap"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={initial?.bogo?.buyAmountCap ?? ""}
                    placeholder="Only this much of the Buy side counts. Blank = uncapped."
                  />
                </div>

                <label className="col-span-2 inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="bogo.showFreeQtyOnPos"
                    defaultChecked={initial?.bogo?.showFreeQtyOnPos ?? true}
                  />
                  Show free-qty line on the POS bill
                </label>

                <div className="col-span-2">
                  <Label>Buy from</Label>
                  <div className="flex gap-2 mb-2">
                    {(["ALL", "CATEGORIES", "ITEMS"] as const).map((s) => (
                      <label key={s} className="inline-flex items-center gap-1.5 text-sm">
                        <input
                          type="radio"
                          name="bogo.buyScope"
                          value={s}
                          checked={buyScope === s}
                          onChange={() => setBuyScope(s)}
                        />
                        {s === "ALL" ? "All items" : s === "CATEGORIES" ? "Categories" : "Items"}
                      </label>
                    ))}
                  </div>
                  <ScopePicker
                    scope={buyScope}
                    namePrefix="bogo.buyScopeIds"
                    defaultIds={initBuyIds}
                    categories={categories}
                    items={items}
                  />
                </div>

                <div className="col-span-2">
                  <Label>Get from</Label>
                  <div className="flex gap-2 mb-2">
                    {(["ALL", "CATEGORIES", "ITEMS"] as const).map((s) => (
                      <label key={s} className="inline-flex items-center gap-1.5 text-sm">
                        <input
                          type="radio"
                          name="bogo.getScope"
                          value={s}
                          checked={getScope === s}
                          onChange={() => setGetScope(s)}
                        />
                        {s === "ALL" ? "All items" : s === "CATEGORIES" ? "Categories" : "Items"}
                      </label>
                    ))}
                  </div>
                  <ScopePicker
                    scope={getScope}
                    namePrefix="bogo.getScopeIds"
                    defaultIds={initGetIds}
                    categories={categories}
                    items={items}
                  />
                </div>
              </div>
            </TabsContent>

            {/* ───────── TAB 3: Validity & code ─────────────────── */}
            <TabsContent value="validity" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Validation mode *</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { v: "NONE", label: "Automatic", desc: "Fires at settle. No code." },
                      { v: "CODE_ONLY", label: "Code only", desc: "Cashier types a code." },
                      { v: "COUPON_VALIDATED", label: "Coupon validated", desc: "Code resolved via coupon master." },
                    ].map((m) => (
                      <label
                        key={m.v}
                        className={
                          "border rounded-md p-2 text-xs cursor-pointer transition-colors " +
                          (validationMode === m.v ? "border-primary bg-primary/5" : "hover:bg-accent")
                        }
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <input
                            type="radio"
                            name="validationMode"
                            value={m.v}
                            checked={validationMode === m.v}
                            onChange={() => setValidationMode(m.v)}
                          />
                          <span className="font-medium">{m.label}</span>
                        </div>
                        <span className="text-muted-foreground">{m.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {validationMode !== "NONE" && (
                  <div className="col-span-2">
                    <Label>
                      Coupon code {validationMode === "COUPON_VALIDATED" ? "*" : "(optional)"}
                    </Label>
                    <Input
                      name="code"
                      defaultValue={initial?.code ?? ""}
                      placeholder="WELCOME10"
                      style={{ textTransform: "uppercase" }}
                    />
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Leave blank to auto-generate. Must be unique across the chain.
                    </p>
                  </div>
                )}

                <div>
                  <Label>Valid from</Label>
                  <Input
                    name="validFrom"
                    type="date"
                    defaultValue={toDateInput(initial?.validFrom)}
                  />
                </div>
                <div>
                  <Label>Valid to</Label>
                  <Input
                    name="validTo"
                    type="date"
                    defaultValue={toDateInput(initial?.validTo)}
                  />
                </div>

                <div>
                  <Label>Time from</Label>
                  <Input
                    name="timeFrom"
                    type="time"
                    defaultValue={initial?.timeFrom ?? ""}
                  />
                </div>
                <div>
                  <Label>Time to</Label>
                  <Input
                    name="timeTo"
                    type="time"
                    defaultValue={initial?.timeTo ?? ""}
                  />
                </div>

                <div className="col-span-2">
                  <Label>Days of week (blank = all days)</Label>
                  <ChipMultiSelect
                    name="daysOfWeek"
                    options={DOW}
                    defaultValues={initDow}
                  />
                </div>

                <label className="col-span-2 inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} />
                  Active
                </label>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save discount"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Status badge for the list page — short helper kept here so the page
 * stays a pure server component. */
export function DiscountTypeBadge({ type }: { type: string }) {
  const label =
    type === "FLAT"
      ? "Fixed"
      : type === "FIXED"
      ? "Fixed"
      : type === "PERCENT"
      ? "%"
      : type === "PERCENTAGE"
      ? "%"
      : type === "BOGO"
      ? "BOGO"
      : type === "FIXED_PRICE"
      ? "Fixed price"
      : type;
  return <Badge variant="outline">{label}</Badge>;
}
