"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Search, ShieldCheck, Check } from "lucide-react";
import { inr } from "@/lib/utils";
import {
  savePlan,
  enrollMember,
  lookupMemberByPhone,
  generateOtp,
  verifyAndRedeem,
} from "./actions";

// ---------- Plan dialog ----------

type PlanInit = {
  id?: string;
  name: string;
  price: number;
  durationDays: number;
  benefitName: string;
  benefitItemId: string;
  qtyPerDay: number;
};

export function PlanDialog({
  children,
  items,
  initial,
}: {
  children: React.ReactNode;
  items: { id: string; name: string }[];
  initial?: PlanInit;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit plan" : "New membership plan"}</DialogTitle>
          <DialogDescription>
            E.g. <strong>Tea Club</strong> · ₹1000 · 365 days · 1 free tea per day.
          </DialogDescription>
        </DialogHeader>
        <form
          action={async (fd) => {
            await savePlan(fd);
            toast({ variant: "success", title: initial?.id ? "Plan updated" : "Plan created" });
            setOpen(false);
            router.refresh();
          }}
          className="grid grid-cols-2 gap-3"
        >
          {initial?.id && <input type="hidden" name="id" value={initial.id} />}
          <div className="col-span-2">
            <Label>Plan name</Label>
            <Input name="name" required defaultValue={initial?.name} placeholder="Tea Club" />
          </div>
          <div>
            <Label>Price (₹)</Label>
            <Input name="price" type="number" step="0.01" min="1" required defaultValue={initial?.price ?? 1000} />
          </div>
          <div>
            <Label>Valid for (days)</Label>
            <Input name="durationDays" type="number" min="1" defaultValue={initial?.durationDays ?? 365} />
          </div>
          <div className="col-span-2">
            <Label>Benefit name</Label>
            <Input
              name="benefitName"
              required
              defaultValue={initial?.benefitName}
              placeholder="One free tea per day, any outlet"
            />
          </div>
          <div>
            <Label>Item granted</Label>
            <select
              name="benefitItemId"
              defaultValue={initial?.benefitItemId ?? ""}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">— None —</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Quantity per day</Label>
            <Input name="qtyPerDay" type="number" min="1" defaultValue={initial?.qtyPerDay ?? 1} />
          </div>
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save plan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Enroll dialog ----------

export function EnrollDialog({
  children,
  plans,
}: {
  children: React.ReactNode;
  plans: { id: string; name: string; price: number }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enroll member</DialogTitle>
          <DialogDescription>Customer pays the plan price and the membership starts immediately.</DialogDescription>
        </DialogHeader>
        <form
          action={async (fd) => {
            try {
              await enrollMember(fd);
              toast({ variant: "success", title: "Member enrolled" });
              setOpen(false);
              router.refresh();
            } catch (e) {
              toast({ variant: "destructive", title: "Enroll failed", description: String(e) });
            }
          }}
          className="space-y-3"
        >
          <div>
            <Label>Customer phone</Label>
            <Input name="customerPhone" required placeholder="+919812345670" />
          </div>
          <div>
            <Label>Customer name (optional if existing)</Label>
            <Input name="customerName" placeholder="Aarav Sharma" />
          </div>
          <div>
            <Label>Plan</Label>
            <select name="planId" required className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {inr(p.price)}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Enroll</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Redeem dialog (POS-flow) ----------

type LookupResult = {
  membershipId: string;
  customerName: string;
  planName: string;
  expiresAt: string;
  benefits: { id: string; name: string; itemId: string | null; itemName?: string; qtyPerDay: number }[];
};

export function RedeemDialog({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [phone, setPhone] = React.useState("");
  const [member, setMember] = React.useState<LookupResult | null>(null);
  const [benefitId, setBenefitId] = React.useState<string>("");
  const [otpCode, setOtpCode] = React.useState<string>("");
  const [sentOtp, setSentOtp] = React.useState<string | null>(null); // for demo display
  const [pending, startTransition] = React.useTransition();

  const reset = () => {
    setMember(null);
    setBenefitId("");
    setOtpCode("");
    setSentOtp(null);
  };

  const lookup = () => {
    if (!phone) return;
    startTransition(async () => {
      reset();
      const r = await lookupMemberByPhone(phone.trim());
      if ("error" in r) {
        toast({ variant: "destructive", title: r.error });
        return;
      }
      setMember(r as LookupResult);
      setBenefitId(r.benefits[0]?.id ?? "");
    });
  };

  const sendOtp = () => {
    if (!member) return;
    startTransition(async () => {
      const r = await generateOtp(member.membershipId);
      if ("error" in r) {
        toast({ variant: "destructive", title: r.error });
        return;
      }
      setSentOtp(r.code);
      toast({
        variant: "success",
        title: "OTP generated",
        description: `In production this would SMS ${r.phone}. Demo: code is ${r.code}.`,
      });
    });
  };

  const submit = () => {
    if (!member || !benefitId || !otpCode) return;
    startTransition(async () => {
      const r = await verifyAndRedeem({
        membershipId: member.membershipId,
        benefitId,
        code: otpCode,
      });
      if ("error" in r) {
        toast({ variant: "destructive", title: "Redemption blocked", description: r.error });
        return;
      }
      toast({ variant: "success", title: "Redeemed ✓", description: "Benefit applied" });
      reset();
      setPhone("");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          reset();
          setPhone("");
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redeem member benefit</DialogTitle>
          <DialogDescription>
            Phone → OTP → verify. The daily cap is enforced by the database across all outlets.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Member phone</Label>
            <div className="flex gap-2">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+919812345670" autoFocus />
              <Button onClick={lookup} disabled={pending || !phone}>
                <Search className="h-4 w-4" />
                Look up
              </Button>
            </div>
          </div>

          {member && (
            <>
              <div className="rounded-md border bg-emerald-50/40 p-3 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  <span className="font-semibold">{member.customerName}</span>
                  <Badge variant="success" className="text-[10px]">{member.planName}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Valid until {new Date(member.expiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </div>
              </div>

              <div>
                <Label>Benefit</Label>
                <select
                  value={benefitId}
                  onChange={(e) => setBenefitId(e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {member.benefits.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.itemName ? ` (${b.itemName})` : ""} · {b.qtyPerDay}/day
                    </option>
                  ))}
                </select>
              </div>

              {sentOtp === null ? (
                <Button variant="outline" onClick={sendOtp} disabled={pending} className="w-full">
                  Send OTP to member
                </Button>
              ) : (
                <div>
                  <Label>OTP</Label>
                  <Input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6-digit code"
                    inputMode="numeric"
                    className="font-mono tracking-widest text-center text-lg"
                  />
                  <div className="text-xs text-amber-700 mt-1">
                    Demo: code is <span className="font-mono font-semibold">{sentOtp}</span>. In production this would be
                    SMS-only.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !member || !benefitId || otpCode.length !== 6}
          >
            <Check className="h-4 w-4" />
            Verify & redeem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
