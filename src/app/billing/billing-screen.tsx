"use client";
import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inr } from "@/lib/utils";
import {
  Minus,
  Plus,
  Trash2,
  Receipt,
  Search,
  Tag,
  X,
  Pause,
  Sparkles,
  Award,
  ArrowRight,
  ArrowLeft,
  Cake,
  Heart,
  AlertTriangle,
  Star,
  ShieldCheck,
  Check,
  ChevronRight,
} from "lucide-react";
import {
  placeOrder,
  holdOrder,
  lookupCustomerByPhone,
  getCustomerInsights,
  getBillMemberships,
  sendBillOtp,
  verifyBillOtp,
} from "./actions";
import { lookupDiscount } from "@/app/menu/discounts/actions";
import { useToast } from "@/components/ui/use-toast";

type Variant = { id: string; name: string; price: number };
type Addon = { id: string; name: string; priceDelta: number };
type Item = {
  id: string;
  name: string;
  price: number;
  taxRate: number;
  categoryId: string;
  isVeg: boolean;
  variants: Variant[];
  addons: Addon[];
};
type Category = { id: string; name: string };
type Table = { id: string; name: string };
type SubType = { name: string; parentType: string };
type Captain = { id: string; name: string; role: string };

type CartLine = {
  key: string;
  item: Item;
  qty: number;
  variant?: Variant;
  addons: Addon[];
  unitPrice: number;
  /** when set, this line is being granted free as a membership benefit */
  membershipClaim?: { membershipId: string; benefitId: string };
};

type MembershipBenefit = {
  id: string;
  name: string;
  itemId: string | null;
  itemName: string | null;
  qtyPerDay: number;
};
type ActiveMembership = {
  membershipId: string;
  planName: string;
  expiresAt: string;
  benefits: MembershipBenefit[];
};
type CustomerInsights = {
  name: string;
  phone: string | null;
  allergies: string | null;
  birthday: string | null;
  anniversary: string | null;
  visits: number;
  avgTicket: number;
  lastVisit: string | null;
  favourites: {
    overall: { name: string; qty: number } | null;
    drink: { name: string; qty: number } | null;
    starter: { name: string; qty: number } | null;
  };
  tags: string[];
};

function lineKey(itemId: string, variantId: string | undefined, addonIds: string[]): string {
  return [itemId, variantId ?? "", ...addonIds.slice().sort()].join("|");
}

type Stage = "customer" | "menu" | "settle";

export function BillingScreen({
  categories,
  items,
  tables,
  taxInclusive = false,
  loyaltyEarnPer = 10,
  loyaltyRedeemRupees = 1,
  subTypes = [],
  captains = [],
}: {
  categories: Category[];
  items: Item[];
  tables: Table[];
  taxInclusive?: boolean;
  loyaltyEarnPer?: number;
  loyaltyRedeemRupees?: number;
  subTypes?: SubType[];
  captains?: Captain[];
}) {
  const { toast } = useToast();
  const [stage, setStage] = React.useState<Stage>("customer");
  const [pending, startTransition] = React.useTransition();

  // ─── Stage 1: customer + order setup ──────────────────────────────────────
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [customerName, setCustomerName] = React.useState("");
  const [allergies, setAllergies] = React.useState("");
  const [birthday, setBirthday] = React.useState("");
  const [anniversary, setAnniversary] = React.useState("");
  const [orderType, setOrderType] = React.useState<"DINE_IN" | "PICKUP" | "DELIVERY">("DINE_IN");
  const [subType, setSubType] = React.useState<string>("");
  const [tableId, setTableId] = React.useState<string>(tables[0]?.id ?? "");
  const [captainId, setCaptainId] = React.useState<string>("");

  // customer enrichment
  const [customerBalance, setCustomerBalance] = React.useState<number>(0);
  const [customerTier, setCustomerTier] = React.useState<"BRONZE" | "SILVER" | "GOLD" | null>(null);
  const [earnMult, setEarnMult] = React.useState<number>(1);
  const [insights, setInsights] = React.useState<CustomerInsights | null>(null);
  const [showProfile, setShowProfile] = React.useState(false);
  const [memberships, setMemberships] = React.useState<ActiveMembership[]>([]);

  // ─── Stage 2: menu + cart ─────────────────────────────────────────────────
  const [activeCat, setActiveCat] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [pickerItem, setPickerItem] = React.useState<Item | null>(null);

  // ─── Stage 3: settle ──────────────────────────────────────────────────────
  const [paymentMode, setPaymentMode] = React.useState<"CASH" | "CARD" | "UPI" | "ONLINE" | "DUE">("CASH");
  const [discount, setDiscount] = React.useState<number>(0);
  const [discountCode, setDiscountCode] = React.useState<string>("");
  const [appliedCode, setAppliedCode] = React.useState<{ code: string; name: string } | null>(null);
  const [couponErr, setCouponErr] = React.useState<string | null>(null);
  const [redeemPoints, setRedeemPoints] = React.useState<number>(0);
  const [tip, setTip] = React.useState<number>(0);

  // ─── Stage 1 helpers ──────────────────────────────────────────────────────
  const lookupAndProfile = () => {
    if (!customerPhone || customerPhone.length < 4) return;
    startTransition(async () => {
      const [c, ins, ms] = await Promise.all([
        lookupCustomerByPhone(customerPhone),
        getCustomerInsights(customerPhone),
        getBillMemberships(customerPhone),
      ]);
      if (c) {
        setCustomerBalance(c.loyaltyPoints);
        setCustomerTier(c.tier as any);
        setEarnMult(c.earnMultiplier);
        if (!customerName) setCustomerName(c.name);
        if (!allergies && c.allergies) setAllergies(c.allergies);
        if (!birthday && c.birthday) setBirthday(c.birthday.slice(0, 10));
        if (!anniversary && c.anniversary) setAnniversary(c.anniversary.slice(0, 10));
      }
      setInsights(ins);
      setMemberships(ms);
    });
  };

  const goToMenu = () => {
    if (insights && insights.visits > 0) {
      setShowProfile(true);
    } else {
      setStage("menu");
    }
  };

  // ─── Stage 2: cart helpers ────────────────────────────────────────────────
  const addLine = (item: Item, variant?: Variant, addons: Addon[] = []) => {
    const unit = (variant?.price ?? item.price) + addons.reduce((s, a) => s + a.priceDelta, 0);
    const key = lineKey(item.id, variant?.id, addons.map((a) => a.id));
    setCart((c) => {
      const found = c.find((l) => l.key === key);
      if (found) return c.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { key, item, qty: 1, variant, addons, unitPrice: unit }];
    });
  };
  const onTapItem = (item: Item) => {
    if (item.variants.length > 0 || item.addons.length > 0) {
      setPickerItem(item);
    } else {
      addLine(item);
    }
  };
  const incLine = (key: string) =>
    setCart((c) => c.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l)));
  const decLine = (key: string) =>
    setCart((c) => c.flatMap((l) => (l.key === key ? (l.qty <= 1 ? [] : [{ ...l, qty: l.qty - 1 }]) : [l])));
  const removeLine = (key: string) =>
    setCart((c) => c.filter((l) => l.key !== key));

  // Map line.key -> qty so menu tiles can show a badge.
  const cartByItemId = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cart) m.set(l.item.id, (m.get(l.item.id) ?? 0) + l.qty);
    return m;
  }, [cart]);

  // Eligible benefits per line: matches by benefit.itemId === line.item.id
  const eligibleBenefitForLine = (line: CartLine) => {
    for (const m of memberships) {
      for (const b of m.benefits) {
        if (b.itemId && b.itemId === line.item.id) {
          // already claimed elsewhere in this cart?
          const alreadyClaimed = cart.some(
            (l) => l.membershipClaim?.membershipId === m.membershipId && l.membershipClaim?.benefitId === b.id
          );
          if (alreadyClaimed && line.membershipClaim?.benefitId !== b.id) continue;
          return { membershipId: m.membershipId, benefit: b, planName: m.planName };
        }
      }
    }
    return null;
  };

  const setMembershipClaim = (key: string, claim: CartLine["membershipClaim"]) => {
    setCart((c) =>
      c.map((l) => (l.key === key ? { ...l, membershipClaim: claim, unitPrice: claim ? 0 : computeUnitPrice(l) } : l))
    );
  };

  const computeUnitPrice = (l: CartLine) =>
    (l.variant?.price ?? l.item.price) + l.addons.reduce((s, a) => s + a.priceDelta, 0);

  // ─── Totals ───────────────────────────────────────────────────────────────
  let sub = 0;
  let tax = 0;
  for (const l of cart) {
    const lineTotal = l.unitPrice * l.qty;
    const rate = l.item.taxRate / 100;
    if (taxInclusive) {
      const baseLine = lineTotal / (1 + rate);
      sub += baseLine;
      tax += lineTotal - baseLine;
    } else {
      sub += lineTotal;
      tax += lineTotal * rate;
    }
  }
  const cappedRedeem = Math.min(redeemPoints, customerBalance);
  const redeemRupees = Math.round(cappedRedeem * loyaltyRedeemRupees);
  const totalDiscount = (discount || 0) + redeemRupees;
  const grand = Math.max(0, Math.round(sub + tax - totalDiscount + (tip || 0)));
  const willEarn = customerPhone ? Math.round(Math.floor(grand / Math.max(1, loyaltyEarnPer)) * earnMult) : 0;

  // ─── Settle helpers ───────────────────────────────────────────────────────
  const applyCoupon = () => {
    setCouponErr(null);
    startTransition(async () => {
      const r = await lookupDiscount(discountCode, sub);
      if (!r) return;
      if ("error" in r) {
        setCouponErr(r.error ?? "Coupon could not be applied");
        setDiscount(0);
        setAppliedCode(null);
        return;
      }
      setDiscount(r.amount);
      setAppliedCode({ code: r.code, name: r.name });
    });
  };
  const removeCoupon = () => {
    setDiscount(0);
    setDiscountCode("");
    setAppliedCode(null);
    setCouponErr(null);
  };

  const linesPayload = () =>
    cart.map((l) => ({
      itemId: l.item.id,
      qty: l.qty,
      unitPrice: l.unitPrice,
      variantName: l.variant?.name,
      addons: l.addons.map((a) => ({ name: a.name, priceDelta: a.priceDelta })),
      lineKey: l.key,
    }));

  const membershipClaimsPayload = () =>
    cart
      .filter((l) => l.membershipClaim)
      .map((l) => ({
        membershipId: l.membershipClaim!.membershipId,
        benefitId: l.membershipClaim!.benefitId,
        lineKey: l.key,
      }));

  const commonOrderInput = () => ({
    orderType,
    tableId: orderType === "DINE_IN" ? tableId || undefined : undefined,
    customerPhone: customerPhone || undefined,
    customerName: customerName || undefined,
    customerAllergies: allergies || undefined,
    customerBirthday: birthday || undefined,
    customerAnniversary: anniversary || undefined,
    discount: discount || 0,
    discountCode: appliedCode?.code,
    redeemPoints: cappedRedeem,
    tip: tip || 0,
    subOrderType: subType || undefined,
    captainId: captainId || undefined,
    giftCardAmount: 0,
    membershipClaims: membershipClaimsPayload(),
    lines: linesPayload(),
  });

  const submit = () => {
    if (cart.length === 0) return;
    startTransition(async () => {
      try {
        await placeOrder({ ...commonOrderInput(), paymentMode });
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't settle", description: String(e) });
      }
    });
  };

  const hold = () => {
    if (cart.length === 0) return;
    startTransition(async () => {
      try {
        const res = await holdOrder(commonOrderInput());
        toast({
          variant: "success",
          title: `Held ${res.invoiceNo}`,
          description: "Bill saved. Settle it later from Live orders.",
        });
        resetAll();
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't hold bill", description: String(e) });
      }
    });
  };

  const resetAll = () => {
    setStage("customer");
    setCart([]);
    setDiscount(0);
    setDiscountCode("");
    setAppliedCode(null);
    setCouponErr(null);
    setCustomerPhone("");
    setCustomerName("");
    setAllergies("");
    setBirthday("");
    setAnniversary("");
    setCustomerBalance(0);
    setCustomerTier(null);
    setEarnMult(1);
    setInsights(null);
    setMemberships([]);
    setRedeemPoints(0);
    setTip(0);
    setSubType("");
    setCaptainId("");
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      <StepIndicator stage={stage} />

      {stage === "customer" && (
        <CustomerStep
          customerPhone={customerPhone}
          setCustomerPhone={setCustomerPhone}
          customerName={customerName}
          setCustomerName={setCustomerName}
          allergies={allergies}
          setAllergies={setAllergies}
          birthday={birthday}
          setBirthday={setBirthday}
          anniversary={anniversary}
          setAnniversary={setAnniversary}
          orderType={orderType}
          setOrderType={setOrderType}
          subType={subType}
          setSubType={setSubType}
          tableId={tableId}
          setTableId={setTableId}
          captainId={captainId}
          setCaptainId={setCaptainId}
          tables={tables}
          subTypes={subTypes}
          captains={captains}
          customerBalance={customerBalance}
          customerTier={customerTier}
          memberships={memberships}
          onLookup={lookupAndProfile}
          onNext={goToMenu}
          pending={pending}
        />
      )}

      {stage === "menu" && (
        <MenuStep
          categories={categories}
          items={items}
          activeCat={activeCat}
          setActiveCat={setActiveCat}
          search={search}
          setSearch={setSearch}
          cart={cart}
          cartByItemId={cartByItemId}
          onTapItem={onTapItem}
          incLine={incLine}
          decLine={decLine}
          removeLine={removeLine}
          memberships={memberships}
          eligibleBenefitForLine={eligibleBenefitForLine}
          setMembershipClaim={setMembershipClaim}
          customerName={customerName || (customerPhone ? "Walk-in" : "Walk-in")}
          orderType={orderType}
          subType={subType}
          tableName={tables.find((t) => t.id === tableId)?.name}
          onBack={() => setStage("customer")}
          onNext={() => setStage("settle")}
          sub={sub}
          tax={tax}
          grand={Math.round(sub + tax)}
        />
      )}

      {stage === "settle" && (
        <SettleStep
          cart={cart}
          sub={sub}
          tax={tax}
          grand={grand}
          totalDiscount={totalDiscount}
          discount={discount}
          appliedCode={appliedCode}
          discountCode={discountCode}
          setDiscountCode={setDiscountCode}
          applyCoupon={applyCoupon}
          removeCoupon={removeCoupon}
          couponErr={couponErr}
          customerPhone={customerPhone}
          customerBalance={customerBalance}
          customerTier={customerTier}
          earnMult={earnMult}
          loyaltyRedeemRupees={loyaltyRedeemRupees}
          loyaltyEarnPer={loyaltyEarnPer}
          redeemPoints={redeemPoints}
          setRedeemPoints={setRedeemPoints}
          cappedRedeem={cappedRedeem}
          redeemRupees={redeemRupees}
          willEarn={willEarn}
          tip={tip}
          setTip={setTip}
          paymentMode={paymentMode}
          setPaymentMode={setPaymentMode}
          memberships={memberships}
          eligibleBenefitForLine={eligibleBenefitForLine}
          setMembershipClaim={setMembershipClaim}
          onBack={() => setStage("menu")}
          onHold={hold}
          onSettle={submit}
          pending={pending}
        />
      )}

      <ItemPicker item={pickerItem} onClose={() => setPickerItem(null)} onAdd={addLine} />

      <CustomerProfileDialog
        open={showProfile}
        onClose={() => setShowProfile(false)}
        onContinue={() => {
          setShowProfile(false);
          setStage("menu");
        }}
        insights={insights}
        memberships={memberships}
      />
    </div>
  );
}

/* ─── Stage indicator ────────────────────────────────────────────────────── */

function StepIndicator({ stage }: { stage: Stage }) {
  const steps: { id: Stage; label: string }[] = [
    { id: "customer", label: "Customer" },
    { id: "menu", label: "Menu" },
    { id: "settle", label: "Settle" },
  ];
  const idx = steps.findIndex((s) => s.id === stage);
  return (
    <div className="flex items-center gap-1 mb-3 overflow-x-auto">
      {steps.map((s, i) => {
        const active = i === idx;
        const done = i < idx;
        return (
          <div key={s.id} className="flex items-center">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${
                active
                  ? "bg-primary text-primary-foreground font-semibold"
                  : done
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              <span
                className={`h-4 w-4 rounded-full grid place-items-center text-[10px] font-bold ${
                  active ? "bg-white/20" : done ? "bg-emerald-600 text-white" : "bg-background"
                }`}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {s.label}
            </div>
            {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground mx-1 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

/* ─── STAGE 1 — Customer + setup ─────────────────────────────────────────── */

function CustomerStep(props: {
  customerPhone: string;
  setCustomerPhone: (s: string) => void;
  customerName: string;
  setCustomerName: (s: string) => void;
  allergies: string;
  setAllergies: (s: string) => void;
  birthday: string;
  setBirthday: (s: string) => void;
  anniversary: string;
  setAnniversary: (s: string) => void;
  orderType: "DINE_IN" | "PICKUP" | "DELIVERY";
  setOrderType: (s: "DINE_IN" | "PICKUP" | "DELIVERY") => void;
  subType: string;
  setSubType: (s: string) => void;
  tableId: string;
  setTableId: (s: string) => void;
  captainId: string;
  setCaptainId: (s: string) => void;
  tables: Table[];
  subTypes: SubType[];
  captains: Captain[];
  customerBalance: number;
  customerTier: "BRONZE" | "SILVER" | "GOLD" | null;
  memberships: ActiveMembership[];
  onLookup: () => void;
  onNext: () => void;
  pending: boolean;
}) {
  const {
    customerPhone,
    setCustomerPhone,
    customerName,
    setCustomerName,
    allergies,
    setAllergies,
    birthday,
    setBirthday,
    anniversary,
    setAnniversary,
    orderType,
    setOrderType,
    subType,
    setSubType,
    tableId,
    setTableId,
    captainId,
    setCaptainId,
    tables,
    subTypes,
    captains,
    customerBalance,
    customerTier,
    memberships,
    onLookup,
    onNext,
    pending,
  } = props;

  const subTypesForType = subTypes.filter((s) => s.parentType === orderType);
  const canProceed = orderType !== "DINE_IN" || tableId.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3">
      <Card>
        <CardHeader>
          <CardTitle>Who's the customer?</CardTitle>
          <CardDescription>
            Phone first — we'll auto-fill name, allergies, loyalty &amp; membership perks from past visits.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <div>
              <Label>Phone</Label>
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+91…"
                autoFocus
                onBlur={onLookup}
              />
            </div>
            <div className="self-end">
              <Button type="button" variant="outline" onClick={onLookup} disabled={!customerPhone || pending}>
                <Search className="h-4 w-4" />
                Look up
              </Button>
            </div>
          </div>

          <div>
            <Label>Name</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Aarav Sharma" />
          </div>

          <div>
            <Label className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              Allergies <span className="text-xs text-muted-foreground font-normal">— comma separated</span>
            </Label>
            <Input
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="nuts, dairy"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="flex items-center gap-1.5">
                <Cake className="h-3.5 w-3.5 text-pink-600" />
                Birthday
              </Label>
              <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
            </div>
            <div>
              <Label className="flex items-center gap-1.5">
                <Heart className="h-3.5 w-3.5 text-rose-600" />
                Anniversary
              </Label>
              <Input type="date" value={anniversary} onChange={(e) => setAnniversary(e.target.value)} />
            </div>
          </div>

          {(customerBalance > 0 || memberships.length > 0) && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3 text-sm space-y-1.5">
              {customerBalance > 0 && (
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-amber-600" />
                  <span className="font-medium">{customerBalance} loyalty pts</span>
                  {customerTier && (
                    <Badge variant={customerTier === "GOLD" ? "warning" : customerTier === "SILVER" ? "info" : "secondary"} className="text-[10px]">
                      {customerTier}
                    </Badge>
                  )}
                </div>
              )}
              {memberships.map((m) => (
                <div key={m.membershipId} className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  <span className="font-medium">{m.planName}</span>
                  <span className="text-xs text-muted-foreground">
                    — {m.benefits.map((b) => b.name).join(", ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order setup</CardTitle>
          <CardDescription>Where will this order be served?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Order type</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {(["DINE_IN", "PICKUP", "DELIVERY"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setOrderType(t)}
                  className={`text-xs px-2 py-2 rounded border ${orderType === t ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`}
                >
                  {t.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          {subTypesForType.length > 0 && (
            <div>
              <Label>Sub-type</Label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSubType("")}
                  className={`text-xs px-2 py-1.5 rounded border ${subType === "" ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
                >
                  —
                </button>
                {subTypesForType.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => setSubType(s.name)}
                    className={`text-xs px-2 py-1.5 rounded border ${subType === s.name ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {orderType === "DINE_IN" && tables.length > 0 && (
            <div>
              <Label>Table</Label>
              <select
                value={tableId}
                onChange={(e) => setTableId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {captains.length > 0 && (
            <div>
              <Label>Captain</Label>
              <select
                value={captainId}
                onChange={(e) => setCaptainId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">— None —</option>
                {captains.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.role}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button onClick={onNext} disabled={!canProceed || pending} className="w-full" size="lg">
            Next: Menu
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── STAGE 2 — Menu + cart ──────────────────────────────────────────────── */

function MenuStep(props: {
  categories: Category[];
  items: Item[];
  activeCat: string;
  setActiveCat: (s: string) => void;
  search: string;
  setSearch: (s: string) => void;
  cart: CartLine[];
  cartByItemId: Map<string, number>;
  onTapItem: (i: Item) => void;
  incLine: (k: string) => void;
  decLine: (k: string) => void;
  removeLine: (k: string) => void;
  memberships: ActiveMembership[];
  eligibleBenefitForLine: (l: CartLine) => { membershipId: string; benefit: MembershipBenefit; planName: string } | null;
  setMembershipClaim: (key: string, claim: CartLine["membershipClaim"]) => void;
  customerName: string;
  orderType: string;
  subType: string;
  tableName?: string;
  onBack: () => void;
  onNext: () => void;
  sub: number;
  tax: number;
  grand: number;
}) {
  const {
    categories,
    items,
    activeCat,
    setActiveCat,
    search,
    setSearch,
    cart,
    cartByItemId,
    onTapItem,
    incLine,
    decLine,
    removeLine,
    memberships,
    eligibleBenefitForLine,
    setMembershipClaim,
    customerName,
    orderType,
    subType,
    tableName,
    onBack,
    onNext,
    sub,
    tax,
    grand,
  } = props;

  const filtered = items.filter((i) => {
    if (activeCat !== "all" && i.categoryId !== activeCat) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
      {/* Catalog */}
      <div className="space-y-3">
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="text-xs text-muted-foreground">
              Billing for <span className="font-semibold text-foreground">{customerName}</span>
              {tableName && <> · table <span className="font-semibold text-foreground">{tableName}</span></>}
              {" · "}
              {orderType.replace("_", " ")}
              {subType && <> · {subType}</>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search items…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <CatChip active={activeCat === "all"} onClick={() => setActiveCat("all")}>
                  All
                </CatChip>
                {categories.map((c) => (
                  <CatChip key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>
                    {c.name}
                  </CatChip>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
          {filtered.map((it) => {
            const qty = cartByItemId.get(it.id) ?? 0;
            const inCart = qty > 0;
            const hasMods = it.variants.length > 0 || it.addons.length > 0;
            const minPrice = it.variants.length ? Math.min(...it.variants.map((v) => v.price)) : it.price;
            const benefitMatch = memberships.some((m) => m.benefits.some((b) => b.itemId === it.id));
            return (
              <button
                key={it.id}
                onClick={() => onTapItem(it)}
                className={`relative text-left border rounded-lg p-3 transition-all ${
                  inCart
                    ? "border-primary bg-primary/10 ring-2 ring-primary/30 shadow-sm"
                    : "bg-card hover:border-primary hover:shadow-sm hover:bg-accent/30"
                }`}
              >
                {inCart && (
                  <span className="absolute -top-2 -right-2 h-6 min-w-6 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold grid place-items-center shadow">
                    {qty}
                  </span>
                )}
                {benefitMatch && (
                  <span className="absolute -top-2 -left-2 h-5 w-5 rounded-full bg-emerald-600 text-white grid place-items-center shadow" title="Eligible for membership benefit">
                    <Star className="h-3 w-3" />
                  </span>
                )}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span
                    className={`h-3 w-3 rounded-sm border ${it.isVeg ? "border-emerald-600" : "border-rose-600"} flex items-center justify-center`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${it.isVeg ? "bg-emerald-600" : "bg-rose-600"}`} />
                  </span>
                  <span className="text-[10px] text-muted-foreground">GST {it.taxRate}%</span>
                </div>
                <div className="font-medium text-sm leading-tight">{it.name}</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-semibold">
                    {it.variants.length > 0 ? `from ${inr(minPrice)}` : inr(it.price)}
                  </span>
                  {hasMods && (
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {it.variants.length > 0 && it.addons.length > 0 ? "V · A" : it.variants.length > 0 ? "V" : "A"}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground text-sm">No items match.</div>
          )}
        </div>
      </div>

      {/* Cart */}
      <Card className="lg:sticky lg:top-20 self-start">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Cart
            <Badge variant="outline">{cart.reduce((s, l) => s + l.qty, 0)} items</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1 space-y-2">
            {cart.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-6">Tap items to add</div>
            )}
            {cart.map((l) => {
              const eligible = eligibleBenefitForLine(l);
              const isClaimed = !!l.membershipClaim;
              return (
                <div key={l.key} className="py-1.5 border-b last:border-0 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-tight">
                        {l.item.name}
                        {l.variant && <span className="text-muted-foreground"> · {l.variant.name}</span>}
                        {isClaimed && (
                          <Badge variant="success" className="ml-1.5 text-[9px]">FREE · Member</Badge>
                        )}
                      </div>
                      {l.addons.length > 0 && (
                        <div className="text-[11px] text-muted-foreground">
                          + {l.addons.map((a) => `${a.name}${a.priceDelta ? ` ₹${a.priceDelta}` : ""}`).join(", ")}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {isClaimed ? <span className="text-emerald-700">FREE</span> : inr(l.unitPrice)} × {l.qty}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => decLine(l.key)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-medium">{l.qty}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => incLine(l.key)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => removeLine(l.key)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {eligible && (
                    <MembershipRedeemRow
                      lineKey={l.key}
                      membershipId={eligible.membershipId}
                      benefitId={eligible.benefit.id}
                      benefitName={eligible.benefit.name}
                      planName={eligible.planName}
                      claimed={isClaimed}
                      onClaim={(c) => setMembershipClaim(l.key, c)}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t pt-3 space-y-1 text-sm">
            <Row label="Subtotal" value={inr(sub)} />
            <Row label="GST" value={inr(tax)} />
            <div className="flex items-center justify-between text-base font-semibold pt-1.5 border-t">
              <span>Total so far</span>
              <span>{inr(grand)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button onClick={onNext} disabled={cart.length === 0} size="lg">
              Next: Settle
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── MembershipRedeemRow — inline OTP flow ──────────────────────────────── */

function MembershipRedeemRow({
  lineKey,
  membershipId,
  benefitId,
  benefitName,
  planName,
  claimed,
  onClaim,
}: {
  lineKey: string;
  membershipId: string;
  benefitId: string;
  benefitName: string;
  planName: string;
  claimed: boolean;
  onClaim: (c: { membershipId: string; benefitId: string } | undefined) => void;
}) {
  const { toast } = useToast();
  const [otp, setOtp] = React.useState("");
  const [sentCode, setSentCode] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState(false);

  if (claimed) {
    return (
      <div className="rounded-md border border-emerald-300 bg-emerald-50/60 px-2 py-1.5 text-xs flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-emerald-800">
          <Check className="h-3 w-3" />
          Redeemed via {planName}
        </span>
        <button
          onClick={() => {
            onClaim(undefined);
            setSentCode(null);
            setOtp("");
          }}
          className="text-emerald-700 hover:text-emerald-900"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  const send = async () => {
    setVerifying(true);
    const r = await sendBillOtp(membershipId);
    setVerifying(false);
    if ("error" in r) {
      toast({ variant: "destructive", title: r.error });
      return;
    }
    setSentCode(r.code);
    toast({
      variant: "success",
      title: "OTP sent",
      description: `Demo: code is ${r.code}. Production would SMS ${r.phone}.`,
    });
  };

  const verify = async () => {
    setVerifying(true);
    const r = await verifyBillOtp(membershipId, otp);
    setVerifying(false);
    if ("error" in r) {
      toast({ variant: "destructive", title: r.error });
      return;
    }
    onClaim({ membershipId, benefitId });
    toast({ variant: "success", title: "Benefit redeemed", description: `${benefitName} applied free.` });
  };

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50/60 px-2 py-1.5 text-xs space-y-1.5">
      <div className="inline-flex items-center gap-1.5 text-amber-900">
        <Star className="h-3 w-3" />
        <span className="font-medium">Eligible for free under {planName}</span>
      </div>
      {sentCode === null ? (
        <Button type="button" size="sm" variant="outline" className="h-7 w-full" onClick={send} disabled={verifying}>
          Send OTP to redeem
        </Button>
      ) : (
        <div className="flex gap-1.5">
          <Input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit OTP"
            inputMode="numeric"
            className="h-7 font-mono tracking-widest text-center"
          />
          <Button type="button" size="sm" className="h-7" onClick={verify} disabled={otp.length !== 6 || verifying}>
            Verify
          </Button>
        </div>
      )}
    </div>
  );
}

/* ─── STAGE 3 — Settle ──────────────────────────────────────────────────── */

function SettleStep(props: {
  cart: CartLine[];
  sub: number;
  tax: number;
  grand: number;
  totalDiscount: number;
  discount: number;
  appliedCode: { code: string; name: string } | null;
  discountCode: string;
  setDiscountCode: (s: string) => void;
  applyCoupon: () => void;
  removeCoupon: () => void;
  couponErr: string | null;
  customerPhone: string;
  customerBalance: number;
  customerTier: "BRONZE" | "SILVER" | "GOLD" | null;
  earnMult: number;
  loyaltyRedeemRupees: number;
  loyaltyEarnPer: number;
  redeemPoints: number;
  setRedeemPoints: (n: number) => void;
  cappedRedeem: number;
  redeemRupees: number;
  willEarn: number;
  tip: number;
  setTip: (n: number) => void;
  paymentMode: "CASH" | "CARD" | "UPI" | "ONLINE" | "DUE";
  setPaymentMode: (m: "CASH" | "CARD" | "UPI" | "ONLINE" | "DUE") => void;
  memberships: ActiveMembership[];
  eligibleBenefitForLine: (l: CartLine) => { membershipId: string; benefit: MembershipBenefit; planName: string } | null;
  setMembershipClaim: (key: string, claim: CartLine["membershipClaim"]) => void;
  onBack: () => void;
  onHold: () => void;
  onSettle: () => void;
  pending: boolean;
}) {
  const {
    cart,
    sub,
    tax,
    grand,
    totalDiscount,
    discount,
    appliedCode,
    discountCode,
    setDiscountCode,
    applyCoupon,
    removeCoupon,
    couponErr,
    customerPhone,
    customerBalance,
    customerTier,
    earnMult,
    loyaltyRedeemRupees,
    loyaltyEarnPer,
    redeemPoints,
    setRedeemPoints,
    cappedRedeem,
    redeemRupees,
    willEarn,
    tip,
    setTip,
    paymentMode,
    setPaymentMode,
    memberships,
    eligibleBenefitForLine,
    setMembershipClaim,
    onBack,
    onHold,
    onSettle,
    pending,
  } = props;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
      {/* Adjustments */}
      <div className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {cart.map((l) => {
              const eligible = eligibleBenefitForLine(l);
              return (
                <div key={l.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="font-medium">{l.item.name}</span>
                      {l.variant && <span className="text-muted-foreground"> · {l.variant.name}</span>}
                      <span className="text-xs text-muted-foreground"> × {l.qty}</span>
                      {l.membershipClaim && <Badge variant="success" className="ml-1.5 text-[9px]">FREE · Member</Badge>}
                    </div>
                    <span className={l.membershipClaim ? "text-emerald-700 font-medium" : ""}>
                      {l.membershipClaim ? "FREE" : inr(l.unitPrice * l.qty)}
                    </span>
                  </div>
                  {eligible && (
                    <MembershipRedeemRow
                      lineKey={l.key}
                      membershipId={eligible.membershipId}
                      benefitId={eligible.benefit.id}
                      benefitName={eligible.benefit.name}
                      planName={eligible.planName}
                      claimed={!!l.membershipClaim}
                      onClaim={(c) => setMembershipClaim(l.key, c)}
                    />
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {customerBalance > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base inline-flex items-center gap-2">
                <Award className="h-4 w-4 text-amber-600" />
                Loyalty
                {customerTier && (
                  <Badge
                    variant={customerTier === "GOLD" ? "warning" : customerTier === "SILVER" ? "info" : "secondary"}
                    className="text-[10px]"
                  >
                    {customerTier}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {customerBalance} pts available · 1 pt = ₹{loyaltyRedeemRupees}
                {earnMult > 1 && <> · {earnMult}× earn</>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Redeem</Label>
                <input
                  type="number"
                  min={0}
                  max={customerBalance}
                  value={redeemPoints}
                  onChange={(e) =>
                    setRedeemPoints(Math.max(0, Math.min(customerBalance, Number(e.target.value) || 0)))
                  }
                  className="h-7 w-24 rounded border bg-background px-2 text-right text-sm"
                />
                <span className="text-xs text-muted-foreground">pts</span>
                <button
                  onClick={() => setRedeemPoints(customerBalance)}
                  className="ml-auto text-xs underline underline-offset-2 text-amber-800"
                >
                  use all
                </button>
              </div>
              {cappedRedeem > 0 && (
                <div className="text-xs text-amber-800">Discounts ₹{redeemRupees} from this bill.</div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base inline-flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Coupon
            </CardTitle>
          </CardHeader>
          <CardContent>
            {appliedCode ? (
              <div className="flex items-center justify-between rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-sm">
                <span className="inline-flex items-center gap-1.5 text-emerald-800">
                  <Tag className="h-3.5 w-3.5" />
                  <span className="font-mono font-semibold">{appliedCode.code}</span>
                  <span className="text-emerald-600">· −{inr(discount)}</span>
                </span>
                <button onClick={removeCoupon} className="text-emerald-700 hover:text-emerald-900">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <Input
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                  placeholder="WELCOME10"
                  className="h-8 text-sm font-mono"
                />
                <Button type="button" size="sm" variant="outline" onClick={applyCoupon} disabled={!discountCode}>
                  Apply
                </Button>
              </div>
            )}
            {couponErr && <div className="text-xs text-rose-600 mt-1">{couponErr}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tip</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Amount</Label>
              <input
                type="number"
                min={0}
                step="1"
                value={tip}
                onChange={(e) => setTip(Math.max(0, Number(e.target.value) || 0))}
                className="h-7 w-24 rounded border bg-background px-2 text-right text-sm"
              />
            </div>
            <div className="flex gap-1.5">
              {[10, 20, 50, 100].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setTip(amt)}
                  className="text-[10px] uppercase tracking-wider rounded-full border px-2 py-0.5 hover:bg-accent"
                >
                  +₹{amt}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment + totals */}
      <Card className="lg:sticky lg:top-20 self-start">
        <CardHeader>
          <CardTitle>Settle</CardTitle>
          <CardDescription>Choose how the bill is paid.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="border rounded-md p-3 space-y-1 text-sm">
            <Row label="Subtotal" value={inr(sub)} />
            <Row label="GST" value={inr(tax)} />
            {totalDiscount > 0 && (
              <div className="flex items-center justify-between text-emerald-700">
                <span>Discount</span>
                <span>−{inr(totalDiscount)}</span>
              </div>
            )}
            {tip > 0 && <Row label="Tip" value={inr(tip)} />}
            <div className="flex items-center justify-between text-base font-semibold pt-1.5 border-t">
              <span>Grand total</span>
              <span>{inr(grand)}</span>
            </div>
            {customerPhone && willEarn > 0 && (
              <div className="text-xs text-emerald-700 inline-flex items-center gap-1.5 pt-1">
                <Sparkles className="h-3 w-3" />
                Earns <strong>{willEarn} pts</strong>
                <span className="text-muted-foreground">(1 pt / ₹{loyaltyEarnPer})</span>
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Payment mode</Label>
            <div className="grid grid-cols-5 gap-1">
              {(["CASH", "CARD", "UPI", "ONLINE", "DUE"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPaymentMode(m)}
                  className={`text-[11px] px-1.5 py-1.5 rounded border ${paymentMode === m ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button type="button" onClick={onBack} variant="outline" size="lg">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button onClick={onSettle} disabled={cart.length === 0 || pending} className="w-full" size="lg">
              <Receipt className="h-4 w-4" />
              {pending ? "Settling…" : `Settle ${inr(grand)}`}
            </Button>
          </div>
          <Button type="button" onClick={onHold} disabled={cart.length === 0 || pending} variant="outline" className="w-full">
            <Pause className="h-4 w-4" />
            Hold bill
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Customer profile popup ─────────────────────────────────────────────── */

function CustomerProfileDialog({
  open,
  onClose,
  onContinue,
  insights,
  memberships,
}: {
  open: boolean;
  onClose: () => void;
  onContinue: () => void;
  insights: CustomerInsights | null;
  memberships: ActiveMembership[];
}) {
  if (!insights) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {insights.name}
            {insights.visits > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px]">
                {insights.visits} visit{insights.visits === 1 ? "" : "s"}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Captain crib-sheet — what this customer usually orders.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <ProfileStat label="Avg ticket" value={`₹${insights.avgTicket.toLocaleString("en-IN")}`} />
            <ProfileStat
              label="Last visit"
              value={
                insights.lastVisit
                  ? new Date(insights.lastVisit).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"
              }
            />
          </div>

          {(insights.favourites.overall || insights.favourites.drink || insights.favourites.starter) && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Favourites</div>
              {insights.favourites.overall && (
                <FavRow icon="🍽️" label="Most ordered" value={insights.favourites.overall.name} qty={insights.favourites.overall.qty} />
              )}
              {insights.favourites.starter && (
                <FavRow icon="🥗" label="Favourite starter" value={insights.favourites.starter.name} qty={insights.favourites.starter.qty} />
              )}
              {insights.favourites.drink && (
                <FavRow icon="🥤" label="Favourite drink" value={insights.favourites.drink.name} qty={insights.favourites.drink.qty} />
              )}
            </div>
          )}

          {insights.allergies && (
            <div className="rounded-md border border-amber-300 bg-amber-50/60 px-3 py-2 text-sm">
              <div className="inline-flex items-center gap-1.5 text-amber-900 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" />
                Allergies
              </div>
              <div className="text-amber-800">{insights.allergies}</div>
            </div>
          )}

          {(insights.birthday || insights.anniversary) && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm space-y-0.5">
              {insights.birthday && (
                <div className="inline-flex items-center gap-1.5">
                  <Cake className="h-3.5 w-3.5 text-pink-600" />
                  Birthday {new Date(insights.birthday).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                </div>
              )}
              {insights.anniversary && (
                <div className="inline-flex items-center gap-1.5">
                  <Heart className="h-3.5 w-3.5 text-rose-600" />
                  Anniversary {new Date(insights.anniversary).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                </div>
              )}
            </div>
          )}

          {memberships.length > 0 && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50/60 px-3 py-2 text-sm space-y-0.5">
              <div className="inline-flex items-center gap-1.5 text-emerald-900 font-semibold">
                <ShieldCheck className="h-3.5 w-3.5" />
                Active memberships
              </div>
              {memberships.map((m) => (
                <div key={m.membershipId} className="text-emerald-800">
                  {m.planName} — {m.benefits.map((b) => b.name).join(", ")}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onContinue}>
            Continue to menu
            <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function FavRow({ icon, label, value, qty }: { icon: string; label: string; value: string; qty: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-card px-3 py-1.5 text-sm">
      <span className="inline-flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="font-medium">{value}</div>
        </span>
      </span>
      <Badge variant="outline" className="text-[10px]">×{qty}</Badge>
    </div>
  );
}

/* ─── Item picker (variants / addons) ────────────────────────────────────── */

function ItemPicker({
  item,
  onClose,
  onAdd,
}: {
  item: Item | null;
  onClose: () => void;
  onAdd: (item: Item, variant?: Variant, addons?: Addon[]) => void;
}) {
  const [variantId, setVariantId] = React.useState<string>("");
  const [selectedAddons, setSelectedAddons] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!item) return;
    setVariantId(item.variants[0]?.id ?? "");
    setSelectedAddons(new Set());
  }, [item]);

  if (!item) return null;

  const variant = item.variants.find((v) => v.id === variantId);
  const addons = item.addons.filter((a) => selectedAddons.has(a.id));
  const unit = (variant?.price ?? item.price) + addons.reduce((s, a) => s + a.priceDelta, 0);

  const submit = () => {
    onAdd(item, variant, addons);
    onClose();
  };

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>Choose modifiers, then add to cart.</DialogDescription>
        </DialogHeader>

        {item.variants.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Variant</div>
            <div className="grid grid-cols-2 gap-2">
              {item.variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVariantId(v.id)}
                  className={`flex items-center justify-between border rounded-md px-3 py-2 text-sm transition-colors ${
                    variantId === v.id ? "border-primary bg-primary/5" : "hover:border-primary/40"
                  }`}
                >
                  <span>{v.name}</span>
                  <span className="font-semibold">{inr(v.price)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {item.addons.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Addons (optional)</div>
            <div className="space-y-1">
              {item.addons.map((a) => {
                const checked = selectedAddons.has(a.id);
                return (
                  <label
                    key={a.id}
                    className={`flex items-center justify-between border rounded-md px-3 py-2 text-sm cursor-pointer ${
                      checked ? "border-primary bg-primary/5" : "hover:border-primary/40"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedAddons((s) => {
                            const next = new Set(s);
                            if (next.has(a.id)) next.delete(a.id);
                            else next.add(a.id);
                            return next;
                          });
                        }}
                      />
                      {a.name}
                    </span>
                    <span className="text-muted-foreground">
                      {a.priceDelta === 0 ? "free" : `+${inr(a.priceDelta)}`}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter className="items-center !justify-between mt-2">
          <div className="text-sm">
            <span className="text-muted-foreground">Line total:</span>{" "}
            <span className="font-semibold">{inr(unit)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit}>Add to cart</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CatChip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border ${
        active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
