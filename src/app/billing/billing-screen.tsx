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
  DialogTrigger,
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
  ChefHat,
} from "lucide-react";
import {
  placeOrder,
  holdOrder,
  lookupCustomerByPhone,
  getCustomerInsights,
  getBillMemberships,
  sendBillOtp,
  verifyBillOtp,
  listHeldBills,
  getAutoDiscount,
  reprintKot,
  addRoundKot,
} from "./actions";
import Link from "next/link";
import { lookupDiscount } from "@/app/menu/discounts/actions";
import { useToast } from "@/components/ui/use-toast";
import { DietaryDot } from "@/components/ui/dietary-dot";
import { UpiQr } from "@/components/ui/upi-qr";
import { resolveTagIcon, chipClassForColor } from "@/components/menu/tag-icons";
import { Info } from "lucide-react";

type Variant = { id: string; name: string; price: number };
type Addon = { id: string; name: string; priceDelta: number };
type Tag = { id: string; name: string; icon: string; color: string };
type Item = {
  id: string;
  name: string;
  price: number;
  taxRate: number;
  categoryId: string;
  isVeg: boolean;
  imageUrl?: string | null;
  dietary?: string;
  description?: string | null;
  variants: Variant[];
  addons: Addon[];
  tags?: Tag[];
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
  /** Round number in which this line was punched to the kitchen. Undefined = not yet sent. */
  sentInRound?: number;
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
  captainMode = false,
  canApplyDiscount = true,
  canSettleBill = true,
  loggedInUser = null,
  upiVpa = null,
  outletName = "",
  kdsEnabled = true,
  serviceChargePct = 10,
  resumed = null,
}: {
  categories: Category[];
  items: Item[];
  tables: Table[];
  taxInclusive?: boolean;
  loyaltyEarnPer?: number;
  loyaltyRedeemRupees?: number;
  subTypes?: SubType[];
  captains?: Captain[];
  /** When true, hides the Settle stage entirely (audit TASK 27).
   *  Captains only take orders + send KOTs; cashiers / managers settle. */
  captainMode?: boolean;
  /** When false, hides the Coupon card on Settle. Per the POS access
   *  matrix only Managers can apply discounts; cashiers go through an
   *  Override request. */
  canApplyDiscount?: boolean;
  /** When false, hides the "Settle bill" button at the end of the Settle
   *  stage. Receptionists and Captains see only "Hold / Save bill". */
  canSettleBill?: boolean;
  /** Currently signed-in user. When a Captain opens the bill we auto-pin
   *  them as the captain (no dropdown). When a Cashier (BILLER) opens it
   *  we render a read-only "Cashier" badge. Managers/Owners still get
   *  the full dropdown so they can hand the order to any captain. */
  loggedInUser?: { id: string; name: string; role: string } | null;
  /** UPI VPA used to render the dynamic QR at Settle when UPI is the mode (TASK 20). */
  upiVpa?: string | null;
  outletName?: string;
  /** When false, "Send KOT" becomes "Print KOT" (local printer instead of KDS push). */
  kdsEnabled?: boolean;
  /** Default service-charge percentage. 0 = disabled. Cashier can toggle off on customer request. */
  serviceChargePct?: number;
  /** When set, rehydrates from this held bill instead of starting fresh. */
  resumed?: {
    id: string;
    invoiceNo: string;
    orderType: "DINE_IN" | "PICKUP" | "DELIVERY";
    subOrderType: string | null;
    tableId: string | null;
    captainId: string | null;
    customerPhone: string;
    customerName: string;
    allergies: string;
    birthday: string;
    anniversary: string;
    items: Array<{
      orderItemId: string;
      itemId: string;
      itemName: string;
      qty: number;
      price: number;
      taxRate: number;
      variantName: string | null;
      addonsJson: string | null;
    }>;
    kots: Array<{ id: string; kotNo: string; status: string; printedCount: number; reprintCount: number }>;
    notes: string | null;
  } | null;
}) {
  const { toast } = useToast();
  // When resuming a held bill, jump straight to the Menu step so the captain
  // can add more items or settle.
  const [stage, setStage] = React.useState<Stage>(resumed ? "menu" : "customer");
  const [pending, startTransition] = React.useTransition();
  // Mutable — first KOT creates the Order and we cache its id here so
  // subsequent Round-N sends know which Order to append to.
  const [resumedOrderId, setResumedOrderId] = React.useState<string | null>(resumed?.id ?? null);
  /** True once the kitchen has been notified (printedCount > 0). Locks the
   * Send KOT button — a separate Reprint button covers the anti-leakage flow. */
  const initialKotSent =
    resumed?.kots?.some((k) => k.printedCount > 0)
      ? { invoiceNo: resumed.kots[0].kotNo, reprintCount: resumed.kots[0].reprintCount }
      : null;

  // ─── Stage 1: customer + order setup ──────────────────────────────────────
  const [customerPhone, setCustomerPhone] = React.useState(resumed?.customerPhone ?? "");
  const [customerName, setCustomerName] = React.useState(resumed?.customerName ?? "");
  const [allergies, setAllergies] = React.useState(resumed?.allergies ?? "");
  const [birthday, setBirthday] = React.useState(resumed?.birthday ?? "");
  const [anniversary, setAnniversary] = React.useState(resumed?.anniversary ?? "");
  const [orderType, setOrderType] = React.useState<"DINE_IN" | "PICKUP" | "DELIVERY">(resumed?.orderType ?? "DINE_IN");
  const [subType, setSubType] = React.useState<string>(resumed?.subOrderType ?? "");
  const [tableId, setTableId] = React.useState<string>(resumed?.tableId ?? tables[0]?.id ?? "");
  // Captain attribution. Default precedence:
  //   1. Held bill being resumed → keep its captain
  //   2. Logged-in user is a Captain → pin them (their bill, their attribution)
  //   3. Otherwise empty so Manager/Owner picks from the dropdown
  const [captainId, setCaptainId] = React.useState<string>(
    resumed?.captainId ??
      (loggedInUser?.role === "CAPTAIN" ? loggedInUser.id : "")
  );

  // customer enrichment
  const [customerBalance, setCustomerBalance] = React.useState<number>(0);
  const [customerTier, setCustomerTier] = React.useState<"BRONZE" | "SILVER" | "GOLD" | null>(null);
  const [earnMult, setEarnMult] = React.useState<number>(1);
  const [insights, setInsights] = React.useState<CustomerInsights | null>(null);
  const [showProfile, setShowProfile] = React.useState(false);
  const [memberships, setMemberships] = React.useState<ActiveMembership[]>([]);

  // ─── Stage 2: menu + cart ─────────────────────────────────────────────────
  const [activeCat, setActiveCat] = React.useState<string>("all");
  const [activeTag, setActiveTag] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  // When resuming a held bill, seed the cart from its existing line items so
  // the captain can pick up exactly where the bill was left off.
  const [cart, setCart] = React.useState<CartLine[]>(() => {
    if (!resumed) return [];
    return resumed.items.map((li) => {
      const baseItem = items.find((it) => it.id === li.itemId);
      const fallback: Item = baseItem ?? {
        id: li.itemId,
        name: li.itemName,
        price: li.price,
        taxRate: li.taxRate,
        categoryId: "",
        isVeg: true,
        variants: [],
        addons: [],
      };
      const addons: Addon[] = (() => {
        if (!li.addonsJson) return [];
        try {
          return (JSON.parse(li.addonsJson) as Array<{ name: string; priceDelta: number }>).map((a, i) => ({
            id: `resumed-${li.orderItemId}-${i}`,
            name: a.name,
            priceDelta: a.priceDelta,
          }));
        } catch {
          return [];
        }
      })();
      return {
        key: `resumed-${li.orderItemId}`,
        item: fallback,
        qty: li.qty,
        variant: li.variantName ? { id: `v-${li.orderItemId}`, name: li.variantName, price: li.price } : undefined,
        addons,
        unitPrice: li.price,
        sentInRound: 1, // existing lines were punched on the original KOT
      };
    });
  });
  // Track which round is "next" — used to flip the button label to Round N.
  const [currentRound, setCurrentRound] = React.useState<number>(
    resumed?.kots?.length ? resumed.kots.length : 0
  );
  const [pickerItem, setPickerItem] = React.useState<Item | null>(null);

  // ─── Stage 3: settle ──────────────────────────────────────────────────────
  const [paymentMode, setPaymentMode] = React.useState<"CASH" | "CARD" | "UPI" | "ONLINE" | "DUE">("CASH");
  const [discount, setDiscount] = React.useState<number>(0);
  const [discountCode, setDiscountCode] = React.useState<string>("");
  const [appliedCode, setAppliedCode] = React.useState<{ code: string; name: string } | null>(null);
  const [couponErr, setCouponErr] = React.useState<string | null>(null);
  const [redeemPoints, setRedeemPoints] = React.useState<number>(0);
  const [tip, setTip] = React.useState<number>(0);
  const [autoDiscount, setAutoDiscount] = React.useState<{ code: string; name: string; amount: number } | null>(null);
  /** Service charge toggle — default ON when the outlet has a non-zero %. */
  const [serviceChargeOn, setServiceChargeOn] = React.useState<boolean>(serviceChargePct > 0);

  // Subtotal used by the auto-discount engine — computed inline so we don't
  // depend on `sub` (declared further below).
  const subForEngine = React.useMemo(
    () => cart.reduce((s, l) => s + l.unitPrice * l.qty, 0),
    [cart]
  );

  // ─── POS keyboard shortcuts (audit §5.6) ────────────────────────────────
  // Digit 1..9 → activate Nth category, "K" send KOT, "S" go to Settle,
  // "B" go back a step, "Esc" reset. Disabled while the user is typing in any
  // <input> / <textarea> / <select> so we don't fight with form entry.
  const [showShortcuts, setShowShortcuts] = React.useState(false);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "?") {
        setShowShortcuts((v) => !v);
        return;
      }
      if (stage === "menu") {
        if (/^[1-9]$/.test(key)) {
          const idx = Number(key) - 1;
          if (idx === 0) setActiveCat("all");
          else if (categories[idx - 1]) setActiveCat(categories[idx - 1].id);
          e.preventDefault();
          return;
        }
        if (key === "k" && cart.length > 0) {
          sendKot();
          e.preventDefault();
          return;
        }
        if (key === "s" && cart.length > 0) {
          setStage("settle");
          e.preventDefault();
          return;
        }
        if (key === "b") {
          setStage("customer");
          e.preventDefault();
          return;
        }
      }
      if (stage === "settle") {
        if (key === "b") {
          setStage("menu");
          e.preventDefault();
          return;
        }
      }
      if (key === "escape") {
        setShowShortcuts(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, cart.length, categories]);

  // ─── Auto-discount engine (TASK 12) ──────────────────────────────────────
  // Whenever the cart subtotal changes, ask the server for the best matching
  // auto-discount. Only applies if no manual coupon is in play (manual wins).
  React.useEffect(() => {
    if (cart.length === 0 || appliedCode) {
      setAutoDiscount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await getAutoDiscount(subForEngine);
        if (!cancelled) {
          setAutoDiscount(r ? { code: r.code, name: r.name, amount: r.amount } : null);
          if (r) setDiscount(r.amount);
          else setDiscount((d) => (appliedCode ? d : 0));
        }
      } catch {
        /* swallow — engine errors shouldn't break the wizard */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subForEngine, cart.length, appliedCode]);

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
  // Service charge: 10% (or outlet-configured) of sub, applied ON by default.
  // Cashier can flip it off at Settle on customer request.
  const serviceChargeAmt =
    serviceChargeOn && serviceChargePct > 0
      ? Math.round((sub * serviceChargePct) / 100)
      : 0;
  const grand = Math.max(0, Math.round(sub + tax - totalDiscount + serviceChargeAmt + (tip || 0)));
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
    // When the cart was resumed from a held bill or a receptionist
    // seed, send the source id so the server deletes it before
    // creating the new order. Keeps the one-bill-per-table invariant
    // intact and stops resumed bills from duplicating on the floor plan.
    existingOrderId: resumed?.id ?? undefined,
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

  // ─── Send KOT (audit TASK 2) ────────────────────────────────────────────
  // Saves the order as held (state: SAVED) AND tells the kitchen to start cooking.
  // Stays on the Menu step so the captain can add more items (Round 2 KOT)
  // before settling.
  const [kotSent, setKotSent] = React.useState<{ invoiceNo: string; reprintCount?: number } | null>(initialKotSent);

  // ─── KOT send / reprint (TASK 2 + audit improvement) ─────────────────────
  // First round → uses `holdOrder` (creates the Order + initial KitchenTicket).
  // Subsequent rounds → uses `addRoundKot` which appends NEW lines to the
  // existing Order and creates a fresh KitchenTicket. Lines that already went
  // out are marked with `sentInRound` so the engine doesn't re-fire them.
  const unsentCart = cart.filter((l) => !l.sentInRound);
  const sendKot = () => {
    if (unsentCart.length === 0) return;
    startTransition(async () => {
      try {
        // Round 1 — no order exists yet, holdOrder creates it.
        if (!kotSent && !resumedOrderId) {
          const res = await holdOrder(commonOrderInput());
          // Notify the local print-agent (no-op stub today, real printer
          // hook tomorrow). No UI redirect / preview either way — the
          // captain stays on this page and can click "View KOT" in the
          // success banner below if they want to see the receipt.
          fetch("/api/print/kot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: res.id,
              kotNo: res.invoiceNo,
              station: "MAIN",
              lines: linesPayload(),
              auto: kdsEnabled ? "kds" : "print",
            }),
          }).catch(() => {});
          setKotSent({ invoiceNo: res.invoiceNo });
          // Mark every cart line as sent in round 1.
          setCart((c) => c.map((l) => ({ ...l, sentInRound: 1 })));
          setCurrentRound(1);
          setResumedOrderId(res.id);
          window.history.replaceState({}, "", `/billing?resume=${res.id}`);
          toast({
            variant: "success",
            title: kdsEnabled ? "KOT sent to kitchen" : "KOT sent to printer",
            description: `${res.invoiceNo} · add more items any time, then send another round.`,
          });
          return;
        }

        // Subsequent rounds — call addRoundKot with the unsent lines only.
        const orderId = resumedOrderId; // set on first send via history.replaceState
        if (!orderId) throw new Error("Order id missing for round KOT.");
        const newLines = unsentCart.map((l) => ({
          itemId: l.item.id,
          qty: l.qty,
          unitPrice: l.unitPrice,
          variantName: l.variant?.name,
          addons: l.addons.map((a) => ({ name: a.name, priceDelta: a.priceDelta })),
        }));
        const res = await addRoundKot({ orderId, lines: newLines });
        // Fire-and-forget print-agent hook for every new KOT in this round.
        // Same behaviour for KDS-on or print-only mode — no UI redirect.
        for (const k of res.kots) {
          fetch("/api/print/kot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId,
              kotNo: k.kotNo,
              station: k.station,
              lines: newLines,
              auto: kdsEnabled ? "kds" : "print",
            }),
          }).catch(() => {});
        }
        // Mark the just-sent lines with the new round.
        setCart((c) => c.map((l) => (l.sentInRound ? l : { ...l, sentInRound: res.roundIndex })));
        setCurrentRound(res.roundIndex);
        toast({
          variant: "success",
          title: `Round ${res.roundIndex} KOT sent`,
          description: `${unsentCart.length} new line(s) → ${res.kots.map((k) => k.kotNo).join(", ")}`,
        });
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't send KOT", description: String(e) });
      }
    });
  };

  // Reprint KOT — requires a reason; calls the server action.
  const reprintKotAction = async (reason: string) => {
    if (!kotSent) return;
    const id = resumedOrderId;
    if (!id) {
      toast({ variant: "destructive", title: "Can't reprint", description: "Order id missing." });
      return;
    }
    try {
      const r = await reprintKot(id, reason);
      setKotSent({ invoiceNo: r.kotNo, reprintCount: r.reprintCount });
      // No preview popup — user can click "View KOT" in the banner if needed.
      toast({ variant: "success", title: "KOT re-printed", description: `Reason logged: ${reason}` });
    } catch (e) {
      toast({ variant: "destructive", title: "Reprint failed", description: String(e) });
    }
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
          loggedInUser={loggedInUser}
        />
      )}

      {stage === "menu" && (
        <MenuStep
          categories={categories}
          items={items}
          activeCat={activeCat}
          setActiveCat={setActiveCat}
          activeTag={activeTag}
          setActiveTag={setActiveTag}
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
          onSendKot={sendKot}
          onReprintKot={reprintKotAction}
          kdsEnabled={kdsEnabled}
          kotSent={kotSent}
          resumedOrderId={resumedOrderId}
          unsentCount={unsentCart.length}
          currentRound={currentRound}
          captainMode={captainMode}
          sub={sub}
          tax={tax}
          grand={Math.round(sub + tax)}
          pending={pending}
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
          autoDiscount={autoDiscount}
          upiVpa={upiVpa}
          outletName={outletName}
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
          serviceChargePct={serviceChargePct}
          serviceChargeOn={serviceChargeOn}
          setServiceChargeOn={setServiceChargeOn}
          serviceChargeAmt={serviceChargeAmt}
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
          canApplyDiscount={canApplyDiscount}
          canSettleBill={canSettleBill}
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

      {/* Keyboard shortcut hint pill — always visible on the menu/settle steps. */}
      {(stage === "menu" || stage === "settle") && (
        <button
          type="button"
          onClick={() => setShowShortcuts(true)}
          className="fixed bottom-3 right-3 z-30 hidden md:inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground shadow hover:bg-accent"
          title="View keyboard shortcuts"
        >
          ? Shortcuts
        </button>
      )}

      {/* Shortcuts overlay */}
      {showShortcuts && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 grid place-items-center p-4"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border bg-card shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b text-sm font-semibold">POS shortcuts</div>
            <ul className="p-3 space-y-1.5 text-sm">
              <Shortcut keys={["1", "9"]} desc="Switch category" />
              <Shortcut keys={["K"]} desc="Send KOT to kitchen" />
              <Shortcut keys={["S"]} desc="Go to Settle" />
              <Shortcut keys={["B"]} desc="Back to previous step" />
              <Shortcut keys={["?"]} desc="Toggle this help" />
            </ul>
            <div className="px-3 py-2 border-t text-[10px] text-muted-foreground">Disabled while typing in any input.</div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Reprint KOT button + inline reason capture (anti-leakage).
 * Shown only after a KOT has been sent; opens a tiny popover-style dialog.
 */
function ReprintKotInlineButton({
  onConfirm,
  pending,
}: {
  onConfirm: (reason: string) => Promise<void>;
  pending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="lg" onClick={() => setOpen(true)} disabled={pending}>
        <ChefHat className="h-4 w-4" />
        Reprint
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-print KOT</DialogTitle>
            <DialogDescription>
              Reason required — re-prints are tracked as a leakage signal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Printer jammed / kitchen lost the copy / smudged"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (reason.trim().length < 3) return;
                setBusy(true);
                await onConfirm(reason.trim());
                setBusy(false);
                setReason("");
                setOpen(false);
              }}
              disabled={busy || reason.trim().length < 3}
            >
              {busy ? "Re-printing…" : "Confirm reprint"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Shortcut({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span>{desc}</span>
      <span className="flex items-center gap-0.5">
        {keys.map((k, i) => (
          <React.Fragment key={k}>
            {i > 0 && <span className="text-xs text-muted-foreground">–</span>}
            <kbd className="border rounded px-1.5 py-0.5 text-[10px] font-mono bg-muted">{k}</kbd>
          </React.Fragment>
        ))}
      </span>
    </li>
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
  loggedInUser?: { id: string; name: string; role: string } | null;
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
    loggedInUser,
  } = props;

  const subTypesForType = subTypes.filter((s) => s.parentType === orderType);
  const canProceed = orderType !== "DINE_IN" || tableId.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Who's the customer?</span>
            <RecallHeldButton />
          </CardTitle>
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

          {/* Allergies intentionally captured only at the receptionist's
              assign-table step (Box 1 of the spec) and surfaced from the
              customer profile on lookup. Removed from this form to keep
              the captain's punch flow focused on the order itself. */}

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

          {/* Captain attribution — role-aware per spec:
               • CAPTAIN: their bill; pinned to them (no dropdown).
               • BILLER: cashier-attributed; shown as a read-only badge.
               • MANAGER/OWNER/anyone else: full dropdown so they can
                 hand the order off to any captain in the outlet. */}
          {loggedInUser?.role === "CAPTAIN" ? (
            <div>
              <Label>Captain</Label>
              <div className="h-9 w-full rounded-md border border-primary/40 bg-primary/5 px-3 flex items-center justify-between text-sm">
                <span className="font-medium">{loggedInUser.name}</span>
                <Badge variant="outline" className="text-[10px]">YOU · CAPTAIN</Badge>
              </div>
            </div>
          ) : loggedInUser?.role === "BILLER" ? (
            <div>
              <Label>Cashier</Label>
              <div className="h-9 w-full rounded-md border border-rose-300/40 bg-rose-50/40 px-3 flex items-center justify-between text-sm">
                <span className="font-medium">{loggedInUser.name}</span>
                <Badge variant="outline" className="text-[10px]">YOU · CASHIER</Badge>
              </div>
              {captains.length > 0 && (
                <div className="mt-2">
                  <Label className="text-xs text-muted-foreground">Assign captain (optional)</Label>
                  <select
                    value={captainId}
                    onChange={(e) => setCaptainId(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">— None —</option>
                    {captains
                      .filter((c) => c.role === "CAPTAIN")
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          ) : (
            captains.length > 0 && (
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
            )
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
  activeTag: string;
  setActiveTag: (s: string) => void;
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
  /** Send the KOT to the kitchen now (audit TASK 2). Stays on the Menu step so the captain can add more items. */
  onSendKot: () => void;
  onReprintKot: (reason: string) => Promise<void>;
  kdsEnabled: boolean;
  kotSent: { invoiceNo: string; reprintCount?: number } | null;
  /** Order id once the first round of KOT has been sent — powers the optional "View KOT" link. */
  resumedOrderId: string | null;
  unsentCount: number;
  currentRound: number;
  captainMode: boolean;
  pending: boolean;
  sub: number;
  tax: number;
  grand: number;
}) {
  const {
    categories,
    items,
    activeCat,
    setActiveCat,
    activeTag,
    setActiveTag,
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
    onSendKot,
    onReprintKot,
    kdsEnabled,
    kotSent,
    resumedOrderId,
    unsentCount,
    currentRound,
    captainMode,
    pending,
    sub,
    tax,
    grand,
  } = props;

  const filtered = items.filter((i) => {
    if (activeCat !== "all" && i.categoryId !== activeCat) return false;
    if (activeTag !== "all" && !(i.tags ?? []).some((t) => t.id === activeTag)) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Dedupe tags across all items so the filter row only shows tags
  // actually used in this outlet's menu. Sorting by name keeps the row
  // deterministic across renders.
  const tagRow = React.useMemo(() => {
    const seen = new Map<string, Tag>();
    for (const it of items) for (const t of it.tags ?? []) if (!seen.has(t.id)) seen.set(t.id, t);
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);
  const [infoFor, setInfoFor] = React.useState<Item | null>(null);

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
            {/* Tag filter row — only renders when this outlet's menu has
                any tagged items, so an unconfigured restaurant doesn't
                see a confusing empty toolbar. */}
            {tagRow.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground mr-1">
                  Filter by tag
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTag("all")}
                  className={
                    "inline-flex items-center px-2.5 py-1 rounded-full text-xs border transition-colors " +
                    (activeTag === "all"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-input hover:bg-accent")
                  }
                >
                  All
                </button>
                {tagRow.map((t) => {
                  const Icon = resolveTagIcon(t.icon);
                  const on = activeTag === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveTag(on ? "all" : t.id)}
                      className={
                        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors " +
                        (on ? chipClassForColor(t.color) : "bg-background border-input hover:bg-accent")
                      }
                    >
                      <Icon className="h-3 w-3" />
                      {t.name}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
          {filtered.map((it) => {
            const qty = cartByItemId.get(it.id) ?? 0;
            const inCart = qty > 0;
            const hasMods = it.variants.length > 0 || it.addons.length > 0;
            const minPrice = it.variants.length ? Math.min(...it.variants.map((v) => v.price)) : it.price;
            const benefitMatch = memberships.some((m) => m.benefits.some((b) => b.itemId === it.id));
            // Find the simplest matching cart line for this item so the inline
            // [-] / [+] controls can target it. Items with variants/addons may
            // exist in multiple lines — the +/- on the tile drives the first
            // matching line; the cart sidebar can still edit each variant
            // separately.
            const firstLineForThisItem = cart.find((l) => l.item.id === it.id);
            return (
              <div
                key={it.id}
                onClick={() => onTapItem(it)}
                role="button"
                tabIndex={0}
                className={`relative text-left border rounded-lg p-3 transition-all cursor-pointer ${
                  inCart
                    ? "border-primary bg-primary/10 ring-2 ring-primary/30 shadow-sm"
                    : "bg-card hover:border-primary hover:shadow-sm hover:bg-accent/30"
                }`}
              >
                {/* Inline +/- counter when item is in cart — sticks out of the
                    top-right of the tile so it never overlaps text. */}
                {inCart && firstLineForThisItem && (
                  <div
                    className="absolute -top-3 -right-3 flex items-center gap-0 bg-primary text-primary-foreground rounded-full shadow-md border-2 border-background"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => decLine(firstLineForThisItem.key)}
                      className="h-7 w-7 grid place-items-center hover:bg-primary/80 rounded-l-full"
                      title="Decrease"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="min-w-[1.75rem] text-center text-xs font-bold px-1">{qty}</span>
                    <button
                      type="button"
                      onClick={() => incLine(firstLineForThisItem.key)}
                      className="h-7 w-7 grid place-items-center hover:bg-primary/80 rounded-r-full"
                      title="Increase"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {benefitMatch && (
                  <span className="absolute -top-2 -left-2 h-5 w-5 rounded-full bg-emerald-600 text-white grid place-items-center shadow" title="Eligible for membership benefit">
                    <Star className="h-3 w-3" />
                  </span>
                )}
                {/* Info button — only renders when we have something to
                    show (a description or tags). Sits on the top-left
                    so it doesn't collide with the qty bubble. */}
                {((it.description?.trim()?.length ?? 0) > 0 || (it.tags?.length ?? 0) > 0) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInfoFor(it);
                    }}
                    className="absolute top-1.5 left-1.5 h-6 w-6 grid place-items-center rounded-full bg-background/90 border shadow-sm hover:bg-accent z-10"
                    title="Item details"
                  >
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                )}
                {it.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.imageUrl} alt="" className="h-16 w-full object-cover rounded mb-1.5" />
                ) : null}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <DietaryDot value={(it as any).dietary || "VEG"} />
                  <span className="text-[10px] text-muted-foreground">GST {it.taxRate}%</span>
                </div>
                <div className="font-medium text-sm leading-tight">{it.name}</div>
                {/* Tag icon row — small colored bubbles under the name.
                    We cap at 4 visible icons + "+N" so a heavily tagged
                    item doesn't blow up the tile height. */}
                {(it.tags?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {it.tags!.slice(0, 4).map((t) => {
                      const Icon = resolveTagIcon(t.icon);
                      return (
                        <span
                          key={t.id}
                          title={t.name}
                          className={
                            "h-4 w-4 grid place-items-center rounded-full border " +
                            chipClassForColor(t.color)
                          }
                        >
                          <Icon className="h-2.5 w-2.5" />
                        </span>
                      );
                    })}
                    {it.tags!.length > 4 && (
                      <span className="text-[10px] text-muted-foreground">+{it.tags!.length - 4}</span>
                    )}
                  </div>
                )}
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
              </div>
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
                        {l.sentInRound && (
                          <Badge variant="outline" className="ml-1.5 text-[9px] border-emerald-400 text-emerald-700">
                            ✓ R{l.sentInRound}
                          </Badge>
                        )}
                        {!l.sentInRound && kotSent && (
                          <Badge variant="outline" className="ml-1.5 text-[9px] border-amber-400 text-amber-700">
                            NEW
                          </Badge>
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

          {/* KOT-sent banner — appears after the kitchen receives the order. */}
          {kotSent && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50/70 p-2.5 text-xs text-emerald-900">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  KOT generated · {kotSent.invoiceNo}
                  {typeof kotSent.reprintCount === "number" && kotSent.reprintCount > 0 && (
                    <span className="ml-1 text-amber-700">({kotSent.reprintCount}× re-printed)</span>
                  )}
                </div>
                {/* Optional preview — real <a> tag with target="_blank" so the
                    browser treats it as a user-initiated navigation and never
                    redirects this tab. Only renders if we have an order id. */}
                {resumedOrderId && (
                  <a
                    href={`/orders/kot/${resumedOrderId}/print`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] underline-offset-2 hover:underline text-emerald-800 shrink-0"
                  >
                    View KOT
                  </a>
                )}
              </div>
              <div className="text-emerald-800/80 mt-0.5">
                Kitchen is cooking. Add more items and hit Settle when the customer pays — or re-print the KOT if needed.
              </div>
            </div>
          )}

          {/* KOT controls — primary action between Menu and Settle.
              • If there are unsent lines → Send Round N KOT (Round 1 first time)
              • If everything sent → "All items punched" disabled + Reprint
              • Audit-trail safe: reprint requires a reason. */}
          {unsentCount > 0 ? (
            <Button
              type="button"
              onClick={onSendKot}
              disabled={pending}
              className="w-full"
              size="lg"
            >
              <ChefHat className="h-4 w-4" />
              {kotSent
                ? `${kdsEnabled ? "Send" : "Print"} Round ${currentRound + 1} KOT (${unsentCount} item${unsentCount === 1 ? "" : "s"})`
                : kdsEnabled
                  ? "Send KOT to kitchen"
                  : "Print KOT"}
            </Button>
          ) : (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Button type="button" disabled variant="outline" size="lg" className="w-full">
                <Check className="h-4 w-4 text-emerald-600" />
                All items punched (Round {currentRound})
              </Button>
              <ReprintKotInlineButton
                onConfirm={async (reason) => {
                  await onReprintKot(reason);
                }}
                pending={pending}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            {captainMode ? (
              <Button
                disabled
                variant="outline"
                size="lg"
                title="Captains take orders + send KOTs; a cashier settles bills."
              >
                Settle locked
              </Button>
            ) : (
              <Button onClick={onNext} disabled={cart.length === 0} size="lg">
                Next: Settle
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Item details dialog — opened from the info button on a card.
          We don't add to cart from here; it's purely informational so
          a wary cashier can read the description + tags first. */}
      <Dialog open={!!infoFor} onOpenChange={(v) => !v && setInfoFor(null)}>
        <DialogContent className="max-w-md">
          {infoFor && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <DietaryDot value={(infoFor as any).dietary || "VEG"} />
                  {infoFor.name}
                </DialogTitle>
              </DialogHeader>
              {infoFor.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={infoFor.imageUrl} alt="" className="w-full h-40 object-cover rounded-md" />
              )}
              {(infoFor.tags?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {infoFor.tags!.map((t) => {
                    const Icon = resolveTagIcon(t.icon);
                    return (
                      <span
                        key={t.id}
                        className={
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border " +
                          chipClassForColor(t.color)
                        }
                      >
                        <Icon className="h-3 w-3" />
                        {t.name}
                      </span>
                    );
                  })}
                </div>
              )}
              {infoFor.description?.trim() ? (
                <p className="text-sm text-muted-foreground whitespace-pre-line">{infoFor.description}</p>
              ) : (
                <p className="text-xs text-muted-foreground italic">No description added yet.</p>
              )}
              <div className="flex items-center justify-between text-sm pt-2 border-t">
                <span className="text-muted-foreground">
                  {infoFor.variants.length > 0 ? `From ${inr(Math.min(...infoFor.variants.map((v) => v.price)))}` : inr(infoFor.price)}
                </span>
                <span className="text-xs text-muted-foreground">GST {infoFor.taxRate}%</span>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInfoFor(null)}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    onTapItem(infoFor);
                    setInfoFor(null);
                  }}
                >
                  Add to cart
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Simple counter so the button label flips Round 1 → Round 2 → … if the captain
// keeps adding items and re-sending the KOT mid-meal.
function countSentRounds(_state: { invoiceNo: string } | null) {
  // The current implementation tracks only "has been sent at least once". A future
  // pass can grow this into a numeric round counter when we wire real KOT batching.
  return 0;
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
  autoDiscount: { code: string; name: string; amount: number } | null;
  upiVpa: string | null;
  outletName: string;
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
  serviceChargePct: number;
  serviceChargeOn: boolean;
  setServiceChargeOn: (v: boolean) => void;
  serviceChargeAmt: number;
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
  canApplyDiscount?: boolean;
  canSettleBill?: boolean;
}) {
  const {
    cart,
    sub,
    tax,
    grand,
    totalDiscount,
    discount,
    appliedCode,
    autoDiscount,
    upiVpa,
    outletName,
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
    serviceChargePct,
    serviceChargeOn,
    setServiceChargeOn,
    serviceChargeAmt,
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
    canApplyDiscount = true,
    canSettleBill = true,
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

        {autoDiscount && !appliedCode && (
          <Card className="border-emerald-300 bg-emerald-50/60">
            <CardContent className="py-2.5 px-3 text-sm flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-emerald-900">
                <Sparkles className="h-3.5 w-3.5" />
                <span className="font-semibold">{autoDiscount.name}</span>
                <span className="text-xs text-emerald-700">auto-applied</span>
              </span>
              <span className="font-semibold text-emerald-800">−{inr(autoDiscount.amount)}</span>
            </CardContent>
          </Card>
        )}

        {/* Coupon — per the POS access matrix, only Managers can apply
            discounts. Cashiers/Captains see this card collapsed and the
            input field disabled. An applied coupon (from an earlier
            Manager-approved settle attempt) is still shown read-only so
            the cashier can see what's in effect. */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base inline-flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Coupon
              {!canApplyDiscount && (
                <Badge variant="outline" className="ml-1 text-[10px]">Manager only</Badge>
              )}
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
                {canApplyDiscount && (
                  <button onClick={removeCoupon} className="text-emerald-700 hover:text-emerald-900">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : canApplyDiscount ? (
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
            ) : (
              <div className="text-xs text-muted-foreground italic">
                Ask a Manager to apply a discount, or raise an override request from /overrides.
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
            {/* Service charge — ON by default, click to toggle for this bill. */}
            {serviceChargePct > 0 && (
              <button
                type="button"
                onClick={() => setServiceChargeOn(!serviceChargeOn)}
                className="w-full flex items-center justify-between hover:bg-accent/50 rounded px-1 -mx-1 py-0.5"
                title={serviceChargeOn ? "Remove service charge on customer request" : "Re-apply service charge"}
              >
                <span className={`inline-flex items-center gap-1 ${serviceChargeOn ? "" : "line-through text-muted-foreground"}`}>
                  Service charge ({serviceChargePct}%)
                  {!serviceChargeOn && (
                    <Badge variant="outline" className="text-[9px] ml-1">waived</Badge>
                  )}
                </span>
                <span className={serviceChargeOn ? "" : "line-through text-muted-foreground"}>
                  {serviceChargeOn ? inr(serviceChargeAmt) : inr(Math.round((sub * serviceChargePct) / 100))}
                </span>
              </button>
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

          {/* UPI dynamic QR (audit TASK 20). Visible only when UPI mode + the
              outlet has a VPA configured. */}
          {paymentMode === "UPI" && upiVpa && grand > 0 && (
            <UpiQr
              vpa={upiVpa}
              payeeName={outletName || "Outlet"}
              amount={grand}
              note={`Bill ${new Date().toLocaleDateString("en-IN")}`}
            />
          )}
          {paymentMode === "UPI" && !upiVpa && (
            <div className="rounded-md border border-amber-200 bg-amber-50/50 p-2.5 text-xs text-amber-900">
              No UPI VPA configured yet. Add one in <a href="/settings" className="underline">Settings → Outlet</a> to show a live QR here.
            </div>
          )}

          <div className={canSettleBill ? "grid grid-cols-[auto_1fr] gap-2" : "grid grid-cols-1 gap-2"}>
            <Button type="button" onClick={onBack} variant="outline" size="lg">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            {canSettleBill && (
              <Button onClick={onSettle} disabled={cart.length === 0 || pending} className="w-full" size="lg">
                <Receipt className="h-4 w-4" />
                {pending ? "Settling…" : `Settle ${inr(grand)}`}
              </Button>
            )}
          </div>
          {!canSettleBill && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Your role can't settle bills. Hold the bill — a Cashier or Manager will close it from /settlements.
            </div>
          )}
          <Button type="button" onClick={onHold} disabled={cart.length === 0 || pending} variant="outline" className="w-full">
            <Pause className="h-4 w-4" />
            {canSettleBill ? "Hold bill" : "Save bill for cashier"}
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

/**
 * Recall held bills picker (audit TASK 11 v2). Lists held / printed orders so
 * a captain can resume work on one without leaving the New Bill page. Links to
 * the full order detail page; from there the existing Settle flow takes over.
 */
function RecallHeldButton() {
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState<Awaited<ReturnType<typeof listHeldBills>>>([]);
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    listHeldBills()
      .then((r) => setRows(r))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const term = q.toLowerCase();
    return (
      r.invoiceNo.toLowerCase().includes(term) ||
      (r.customerName ?? "").toLowerCase().includes(term) ||
      (r.customerPhone ?? "").toLowerCase().includes(term) ||
      (r.tableName ?? "").toLowerCase().includes(term)
    );
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Pause className="h-4 w-4" />
          Recall held bill
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recall a held bill</DialogTitle>
          <DialogDescription>
            Search by invoice, customer name, phone, or table.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="INV-… / phone / Aarav / T1"
          autoFocus
        />
        <div className="max-h-72 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? "No held bills." : "No matches."}
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/orders/${r.id}`}
                    onClick={() => setOpen(false)}
                    className="block p-2 rounded-md border hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm">
                          <span className="font-mono">{r.invoiceNo}</span>
                          {r.tableName && <span className="text-muted-foreground"> · {r.tableName}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.customerName ?? "Walk-in"}
                          {r.customerPhone ? ` · ${r.customerPhone}` : ""}
                          {" · "}
                          {r.lineCount} item{r.lineCount === 1 ? "" : "s"}
                          {" · "}
                          {new Date(r.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <span className="text-sm font-semibold shrink-0">{inr(r.grandTotal)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
