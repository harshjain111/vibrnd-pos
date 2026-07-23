"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Badge } from "@/components/ui/badge";
import { Wallet, Plus } from "lucide-react";
import { topUpWalletAction } from "./topup-actions";
import { inr } from "@/lib/utils";

export function TopupDialog({
  customerId,
  customerLabel,
  variant = "default",
  size = "sm",
  trigger,
}: {
  customerId: string;
  customerLabel: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "sm" | "default";
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [amountPaid, setAmountPaid] = React.useState("");
  const [bonus, setBonus] = React.useState("");
  const [bonusDays, setBonusDays] = React.useState("30");
  const [paymentMode, setPaymentMode] = React.useState<"CASH" | "CARD" | "UPI" | "ONLINE">("CASH");
  const [remarks, setRemarks] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<{ paid: number; bonus: number } | null>(null);

  const reset = () => {
    setAmountPaid("");
    setBonus("");
    setBonusDays("30");
    setPaymentMode("CASH");
    setRemarks("");
    setError(null);
    setDone(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("customerId", customerId);
      fd.set("amountPaid", amountPaid);
      if (bonus) fd.set("bonusAmount", bonus);
      fd.set("bonusExpiresInDays", bonusDays);
      fd.set("paymentMode", paymentMode);
      if (remarks) fd.set("remarks", remarks);
      const r = await topUpWalletAction(fd);
      if (!r.ok) {
        setError(r.error);
      } else {
        setDone({ paid: Number(amountPaid), bonus: Number(bonus || 0) });
        setTimeout(() => {
          setOpen(false);
          reset();
        }, 1400);
      }
    } finally {
      setBusy(false);
    }
  };

  const total = Number(amountPaid || 0) + Number(bonus || 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant={variant} size={size}>
            <Wallet className="h-3.5 w-3.5" />
            Top up
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Top up wallet</DialogTitle>
          <DialogDescription>
            Customer paid you real money — credit their wallet + any bonus you&apos;re running.
            Redemption drains the bonus first so it doesn&apos;t burn.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <InlineAlert tone="good">
            Wallet credited for <span className="font-semibold">{customerLabel}</span> —
            ₹{done.paid} paid{done.bonus > 0 ? ` + ₹${done.bonus} bonus` : ""}.
          </InlineAlert>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label htmlFor="amountPaid">Amount customer paid you (₹)</Label>
              <Input
                id="amountPaid"
                type="number"
                min="1"
                step="1"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                required
                autoFocus
                placeholder="1000"
              />
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Lands in the <span className="font-mono">PREPAID</span> bucket — never expires.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="bonus">Bonus (₹)</Label>
                <Input
                  id="bonus"
                  type="number"
                  min="0"
                  step="1"
                  value={bonus}
                  onChange={(e) => setBonus(e.target.value)}
                  placeholder="200"
                />
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Optional — landing in <span className="font-mono">CAMPAIGN</span>.
                </div>
              </div>
              <div>
                <Label htmlFor="bonusDays">Bonus expires in</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="bonusDays"
                    type="number"
                    min="1"
                    value={bonusDays}
                    onChange={(e) => setBonusDays(e.target.value)}
                  />
                  <span className="text-[11px] text-muted-foreground">days</span>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="paymentMode">Payment mode</Label>
              <select
                id="paymentMode"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as any)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
                <option value="ONLINE">Online</option>
              </select>
            </div>

            <div>
              <Label htmlFor="remarks">Remarks (optional)</Label>
              <Input
                id="remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                maxLength={200}
                placeholder="e.g. Diwali top-up promo"
              />
            </div>

            <div className="rounded-md border bg-muted/40 p-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Wallet will receive</span>
              <span className="font-semibold tabular-nums text-base">
                {inr(Math.round(total))}
                {bonus && Number(bonus) > 0 ? (
                  <Badge variant="info" className="ml-2 text-[9px]">
                    +{inr(Math.round(Number(bonus)))} bonus
                  </Badge>
                ) : null}
              </span>
            </div>

            {error ? <InlineAlert tone="bad">{error}</InlineAlert> : null}

            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy || !amountPaid}>
                {busy ? "Crediting…" : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    Credit {inr(Math.round(total))}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
