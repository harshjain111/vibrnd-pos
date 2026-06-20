/**
 * Single source of truth for status/semantic tone colors used across the
 * inventory module (KPI cards, inline alerts, table cell coloring, etc.).
 *
 * Before this, ~20 pages hand-wrote `border-rose-300 bg-rose-50/50` style
 * combos with drifting shades. Everything now references one of these tones so
 * a "warning" looks identical whether it's a banner, a stat card, or a number.
 */
export type Tone = "neutral" | "good" | "bad" | "warn" | "info";

export type ToneClasses = {
  /** Foreground text (e.g. a number or label that should read as good/bad). */
  text: string;
  /** Soft surface background (cards / banners). */
  surface: string;
  /** Border to pair with the soft surface. */
  border: string;
  /** Icon color. */
  icon: string;
  /** Matching <Badge> variant name. */
  badge: "secondary" | "success" | "warning" | "destructive" | "info";
};

export const TONE: Record<Tone, ToneClasses> = {
  neutral: {
    text: "text-foreground",
    surface: "bg-card",
    border: "border-border",
    icon: "text-muted-foreground",
    badge: "secondary",
  },
  good: {
    text: "text-emerald-700",
    surface: "bg-emerald-50/50",
    border: "border-emerald-300",
    icon: "text-emerald-600",
    badge: "success",
  },
  bad: {
    text: "text-rose-700",
    surface: "bg-rose-50/50",
    border: "border-rose-300",
    icon: "text-rose-600",
    badge: "destructive",
  },
  warn: {
    text: "text-amber-700",
    surface: "bg-amber-50/50",
    border: "border-amber-300",
    icon: "text-amber-600",
    badge: "warning",
  },
  info: {
    text: "text-sky-700",
    surface: "bg-sky-50/50",
    border: "border-sky-300",
    icon: "text-sky-600",
    badge: "info",
  },
};

/** Convenience: tone for a signed delta (+ good, − bad, 0 neutral). */
export function deltaTone(n: number): Tone {
  if (n > 0) return "good";
  if (n < 0) return "bad";
  return "neutral";
}
