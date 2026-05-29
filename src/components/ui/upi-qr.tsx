"use client";
import * as React from "react";

/**
 * UPI dynamic-QR generator (audit TASK 20).
 *
 * Builds a UPI deep-link per NPCI's URL spec:
 *   upi://pay?pa=<vpa>&pn=<name>&am=<amount>&tn=<note>&cu=INR&tr=<txnRef>
 *
 * For the QR encoding I'm using a tiny embedded Reed-Solomon-free implementation
 * via Google Charts' QR endpoint at quality M. That keeps the bundle small
 * without pulling in a heavy QR library. If Google Charts is ever unreachable
 * the printed link still works as a fall-back.
 */
export function UpiQr({
  vpa,
  payeeName,
  amount,
  note,
  txnRef,
  size = 240,
}: {
  vpa: string;
  payeeName: string;
  amount: number;
  note?: string;
  txnRef?: string;
  size?: number;
}) {
  const url = React.useMemo(() => buildUpiUrl({ vpa, payeeName, amount, note, txnRef }), [vpa, payeeName, amount, note, txnRef]);
  const qrSrc = `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encodeURIComponent(url)}&chld=M|2`;

  return (
    <div className="flex flex-col items-center gap-2 p-3 rounded-md border bg-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrSrc} width={size} height={size} alt="UPI QR" className="rounded" />
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pay via UPI</div>
        <div className="text-xs font-mono text-muted-foreground mt-0.5">{vpa}</div>
        <div className="text-xs">Amount: <strong>₹{amount.toLocaleString("en-IN")}</strong></div>
      </div>
      <a
        href={url}
        className="text-[10px] text-primary hover:underline"
      >
        Open in UPI app
      </a>
    </div>
  );
}

function buildUpiUrl({
  vpa,
  payeeName,
  amount,
  note,
  txnRef,
}: {
  vpa: string;
  payeeName: string;
  amount: number;
  note?: string;
  txnRef?: string;
}) {
  const params = new URLSearchParams();
  params.set("pa", vpa);
  params.set("pn", payeeName);
  params.set("am", amount.toFixed(2));
  params.set("cu", "INR");
  if (note) params.set("tn", note);
  if (txnRef) params.set("tr", txnRef);
  return `upi://pay?${params.toString()}`;
}
