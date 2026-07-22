"use client";
// Reusable OTP dialog. Consumer provides:
//   • `challengeId` when it already has one (created via server action)
//   • `onVerified(challengeId)` — fires once the code checks out. The
//     caller then invokes its own settle action passing the challengeId
//     back so the server can bind the OTP to the actual action.
//
// Countdown + attempt display + "Resend" (which asks the parent to
// re-fire its send action) live in here so no consumer duplicates the
// UX.

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineAlert } from "@/components/ui/inline-alert";
import { verifyOtpAction } from "@/lib/cve/otp-actions";

export type OtpDialogState = {
  open: boolean;
  challengeId: string;
  channelHint: string | null;
  expiresAt: string; // ISO
  devCode?: string;
};

export function OtpDialog({
  state,
  onOpenChange,
  onVerified,
  onResend,
  purposeLabel = "Verify OTP",
  helpText = "The 6-digit code we just sent expires in a few minutes.",
}: {
  state: OtpDialogState;
  onOpenChange: (open: boolean) => void;
  onVerified: (challengeId: string) => void;
  onResend?: () => void | Promise<void>;
  purposeLabel?: string;
  helpText?: string;
}) {
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [remaining, setRemaining] = React.useState<number>(0);

  // Reset per-open.
  React.useEffect(() => {
    if (!state.open) return;
    setCode("");
    setError(null);
    setAttemptsLeft(null);
  }, [state.open, state.challengeId]);

  // Countdown to expiry so the SM knows when to resend.
  React.useEffect(() => {
    if (!state.open) return;
    const tick = () => {
      const ms = Math.max(0, new Date(state.expiresAt).getTime() - Date.now());
      setRemaining(Math.ceil(ms / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state.open, state.expiresAt]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await verifyOtpAction({ challengeId: state.challengeId, code });
      if (r.ok) {
        onVerified(r.challengeId);
      } else {
        setAttemptsLeft(r.attemptsLeft);
        setError(reasonLabel(r.reason, r.attemptsLeft));
        if (r.reason === "attempts_exhausted" || r.reason === "expired") {
          // Force resend / cancel — the challenge is dead.
        }
      }
    } catch (err: any) {
      setError(err?.message ?? "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const expired = remaining <= 0;
  const dead = expired || attemptsLeft === 0;

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{purposeLabel}</DialogTitle>
          <DialogDescription>
            {helpText}
            {state.channelHint ? ` Sent to ${state.channelHint}.` : ""}
          </DialogDescription>
        </DialogHeader>

        {state.devCode ? (
          <InlineAlert tone="warn" className="text-xs">
            Dev mode — code is <span className="font-mono font-semibold">{state.devCode}</span>.
            SMS provider not yet wired.
          </InlineAlert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="cve-otp">6-digit code</Label>
          <Input
            id="cve-otp"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && code.length === 6 && !dead) submit();
            }}
            placeholder="123456"
            disabled={busy || dead}
            className="text-center tracking-[0.4em] text-lg font-mono"
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {expired ? "OTP expired" : `Expires in ${formatCountdown(remaining)}`}
            </span>
            {attemptsLeft !== null ? (
              <span>{attemptsLeft} attempt{attemptsLeft === 1 ? "" : "s"} left</span>
            ) : null}
          </div>
          {error ? <InlineAlert tone="bad">{error}</InlineAlert> : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {onResend ? (
            <Button variant="ghost" size="sm" onClick={() => onResend()} disabled={busy}>
              Resend
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={busy || code.length !== 6 || dead}>
            {busy ? "Verifying…" : "Verify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function reasonLabel(
  reason: "expired" | "attempts_exhausted" | "invalid" | "not_found" | "already_used",
  attemptsLeft: number,
): string {
  switch (reason) {
    case "expired": return "This OTP has expired — please resend.";
    case "attempts_exhausted": return "Too many wrong attempts — please resend.";
    case "invalid":
      return attemptsLeft > 0
        ? `Wrong code — ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left.`
        : "Too many wrong attempts — please resend.";
    case "already_used": return "This OTP was already used.";
    case "not_found": return "OTP not found — please resend.";
  }
}

function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
