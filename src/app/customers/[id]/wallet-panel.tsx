"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Wallet, Plus, ArrowDown } from "lucide-react";
import {
  creditWalletAction,
  redeemWalletAction,
  requestWalletRedeemOtpAction,
} from "./wallet-actions";
import { inr } from "@/lib/utils";
import { BUCKET_PRIORITY, WALLET_BUCKETS, type WalletBucket } from "@/lib/cve/types";

export type WalletHistoryRow = {
  id: string;
  type: "CREDIT" | "DEBIT";
  bucket: WalletBucket;
  amount: number;
  remaining: number;
  source: string;
  createdAt: string;
  expiresAt: string | null;
  remarks: string | null;
};

export function WalletPanel({
  customerId,
  cachedBalance,
  liveBalance,
  breakdown,
  history,
  canCredit,
  canRedeem,
}: {
  customerId: string;
  cachedBalance: number;
  liveBalance: number;
  breakdown: Record<WalletBucket, number>;
  history: WalletHistoryRow[];
  canCredit: boolean;
  canRedeem: boolean;
}) {
  const activeBuckets = BUCKET_PRIORITY.filter((b) => (breakdown[b] ?? 0) > 0);
  const outOfSync = Math.abs(cachedBalance - liveBalance) > 0.01;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4" />
          Wallet
          <Badge variant="secondary" className="text-[10px]">CVE</Badge>
        </CardTitle>
        <CardDescription>
          Cashback, campaign credits and manual adjustments. Balance is derived from the
          transaction ledger, not the cached column.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Available</div>
            <div className="text-2xl font-semibold tabular-nums">{inr(Math.round(liveBalance))}</div>
            {outOfSync ? (
              <div className="text-[10px] text-amber-700">
                Cached ₹{cachedBalance.toFixed(2)} out of sync — will refresh on next tx.
              </div>
            ) : null}
          </div>
          <div className="flex gap-2">
            {canCredit ? <CreditDialog customerId={customerId} /> : null}
            {canRedeem ? (
              <RedeemDialog customerId={customerId} maxAmount={liveBalance} />
            ) : null}
          </div>
        </div>

        {activeBuckets.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {activeBuckets.map((b) => (
              <span
                key={b}
                className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px]"
              >
                <span className="font-mono text-muted-foreground">{b}</span>
                <span className="font-semibold tabular-nums">{inr(Math.round(breakdown[b]))}</span>
              </span>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground">
            Empty. Credit will show up once a campaign fires or an admin tops it up.
          </div>
        )}

        {history.length > 0 ? (
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Recent activity
            </div>
            <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
              {history.map((h) => (
                <div key={h.id} className="p-2 text-xs flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {h.type === "CREDIT" ? (
                        <Plus className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <ArrowDown className="h-3 w-3 text-rose-600" />
                      )}
                      <span className="font-medium">{h.source}</span>
                      <Badge variant="secondary" className="font-mono text-[9px]">{h.bucket}</Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {new Date(h.createdAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {h.expiresAt
                        ? ` · expires ${new Date(h.expiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`
                        : ""}
                      {h.remarks ? ` · ${h.remarks}` : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0 font-semibold tabular-nums">
                    <span className={h.type === "CREDIT" ? "text-emerald-700" : "text-rose-700"}>
                      {h.type === "CREDIT" ? "+" : "−"}
                      {inr(Math.round(h.amount))}
                    </span>
                    {h.type === "CREDIT" && h.remaining > 0 && h.remaining < h.amount ? (
                      <div className="text-[9px] text-muted-foreground">
                        {inr(Math.round(h.remaining))} left
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ─── Credit dialog ─────────────────────────────────────────────────────

function CreditDialog({ customerId }: { customerId: string }) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-3.5 w-3.5" /> Add credit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Manual wallet credit</DialogTitle>
          <DialogDescription>
            Adds to the MANUAL bucket by default. Use a specific bucket for reversals or
            goodwill you want tracked separately.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setBusy(true);
            try {
              const fd = new FormData(e.currentTarget);
              fd.set("customerId", customerId);
              const r = await creditWalletAction(fd);
              if (!r.ok) setError(r.error);
              else setOpen(false);
            } finally {
              setBusy(false);
            }
          }}
          className="space-y-3"
        >
          <div>
            <Label htmlFor="amount">Amount (₹)</Label>
            <Input id="amount" name="amount" type="number" min="1" step="1" required />
          </div>
          <div>
            <Label htmlFor="bucket">Bucket</Label>
            <select
              id="bucket"
              name="bucket"
              defaultValue="MANUAL"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {WALLET_BUCKETS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="expiresInDays">Expires in (days)</Label>
            <Input id="expiresInDays" name="expiresInDays" type="number" min="1" placeholder="Never" />
          </div>
          <div>
            <Label htmlFor="remarks">Remarks</Label>
            <Input id="remarks" name="remarks" maxLength={200} placeholder="e.g. Goodwill for broken glass" />
          </div>
          {error ? <InlineAlert tone="bad">{error}</InlineAlert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Crediting…" : "Credit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Redeem dialog (OTP-gated, single server round-trip verify) ────────

function RedeemDialog({ customerId, maxAmount }: { customerId: string; maxAmount: number }) {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<"amount" | "otp" | "done">("amount");
  const [amount, setAmount] = React.useState<string>("");
  const [remarks, setRemarks] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [challengeId, setChallengeId] = React.useState<string | null>(null);
  const [channelHint, setChannelHint] = React.useState<string | null>(null);
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [expiresAt, setExpiresAt] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [countdown, setCountdown] = React.useState(0);

  const reset = () => {
    setStep("amount");
    setAmount("");
    setRemarks("");
    setError(null);
    setChallengeId(null);
    setChannelHint(null);
    setDevCode(null);
    setExpiresAt(null);
    setCode("");
  };

  React.useEffect(() => {
    if (step !== "otp" || !expiresAt) return;
    const tick = () => setCountdown(Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [step, expiresAt]);

  const sendOtp = async () => {
    setError(null);
    setBusy(true);
    try {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) {
        setError("Enter a valid amount");
        return;
      }
      if (n > maxAmount) {
        setError(`Wallet only has ₹${maxAmount.toFixed(2)}`);
        return;
      }
      const fd = new FormData();
      fd.set("customerId", customerId);
      fd.set("amount", String(n));
      const r = await requestWalletRedeemOtpAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setChallengeId(r.challengeId);
      setChannelHint(r.channelHint);
      setDevCode(r.devCode ?? null);
      setExpiresAt(r.expiresAt);
      setStep("otp");
    } finally {
      setBusy(false);
    }
  };

  const submitRedeem = async () => {
    if (!challengeId || code.length !== 6) return;
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("customerId", customerId);
      fd.set("amount", amount);
      fd.set("challengeId", challengeId);
      fd.set("code", code);
      if (remarks) fd.set("remarks", remarks);
      const r = await redeemWalletAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setStep("done");
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 900);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" disabled={maxAmount <= 0}>
          <ArrowDown className="h-3.5 w-3.5" /> Redeem
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Redeem wallet</DialogTitle>
          <DialogDescription>
            Wallet available: <span className="font-mono">{inr(Math.round(maxAmount))}</span>.
            OTP verifies before the ledger is touched.
          </DialogDescription>
        </DialogHeader>

        {step === "done" ? (
          <InlineAlert tone="good">Redemption booked.</InlineAlert>
        ) : step === "otp" ? (
          <div className="space-y-3">
            <InlineAlert tone="info" className="text-xs">
              OTP sent to {channelHint ?? "customer"}. Ask them to read it out.
              {devCode ? (
                <>
                  {" "}
                  <span className="font-semibold">Dev code:</span>{" "}
                  <span className="font-mono">{devCode}</span>
                </>
              ) : null}
            </InlineAlert>
            <div>
              <Label htmlFor="code">6-digit code</Label>
              <Input
                id="code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && code.length === 6 && submitRedeem()}
                className="text-center tracking-[0.4em] text-lg font-mono"
                autoFocus
              />
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {countdown > 0 ? `Expires in ${formatCountdown(countdown)}` : "OTP expired — resend"}
              </div>
            </div>
            {error ? <InlineAlert tone="bad">{error}</InlineAlert> : null}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={sendOtp} disabled={busy}>
                Resend
              </Button>
              <Button size="sm" onClick={submitRedeem} disabled={busy || code.length !== 6}>
                {busy ? "Booking…" : `Debit ₹${amount}`}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                max={maxAmount}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={String(Math.floor(maxAmount))}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="remarks">Remarks</Label>
              <Input
                id="remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                maxLength={200}
                placeholder="e.g. Applied to bill INV-1234"
              />
            </div>
            {error ? <InlineAlert tone="bad">{error}</InlineAlert> : null}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={sendOtp} disabled={busy || !amount}>
                {busy ? "Sending OTP…" : "Send OTP"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
