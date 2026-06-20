import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function inr(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function inr2(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function pct(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/**
 * Consistent date rendering across the inventory module. Replaces the many
 * one-off `toLocaleDateString({ day, month, ... })` variants.
 *   short    → 18 Jun 26
 *   long     → 18 June 2026
 *   datetime → 18 Jun, 14:30
 */
export function fmtDate(
  d: Date | string | number | null | undefined,
  style: "short" | "long" | "datetime" = "short"
) {
  if (d === null || d === undefined) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const opts: Intl.DateTimeFormatOptions =
    style === "long"
      ? { day: "2-digit", month: "long", year: "numeric" }
      : style === "datetime"
        ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
        : { day: "2-digit", month: "short", year: "2-digit" };
  return date.toLocaleString("en-IN", opts);
}

/** Quantity + unit, trimming trailing zeros (e.g. `qtyUnit(2.5, "kg")` → "2.5 kg"). */
export function qtyUnit(n: number | null | undefined, unit?: string | null) {
  const v = Number(n ?? 0);
  const num = Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
  return unit ? `${num} ${unit}` : num;
}

/**
 * Build an invoice number for a single outlet.
 *
 * In single-outlet setups invoice numbers were simply `INV-000001`. When a
 * deployment runs multiple outlets, two outlets generating from their own
 * per-outlet counts would inevitably collide on the same number — and
 * `invoiceNo @unique` would reject the second one with a P2002. We avoid
 * that by namespacing every number with the outlet code:
 *
 *   `INV-SMOKZY-01-000157`   `INV-23456-000042`
 *
 * Pass the outlet code as the second arg for new code paths; the single-
 * arg form stays for back-compat (legacy reports / migrated rows).
 */
export function nextInvoiceNo(seq: number, outletCode?: string) {
  const padded = String(seq).padStart(6, "0");
  return outletCode ? `INV-${outletCode}-${padded}` : `INV-${padded}`;
}

/** Same idea as nextInvoiceNo but for KitchenTicket.kotNo (also @unique). */
export function nextKotNo(seq: number, outletCode: string, suffix?: string) {
  const padded = String(seq).padStart(6, "0");
  const base = `KOT-${outletCode}-${padded}`;
  return suffix ? `${base}-${suffix}` : base;
}
