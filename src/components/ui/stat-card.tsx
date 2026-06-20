import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TONE, type Tone } from "@/lib/ui-tone";
import { Card, CardContent } from "@/components/ui/card";

/**
 * One KPI / stat tile. Replaces the per-page `KpiCard`, `Kpi`, `QuickLink`, and
 * `AgeCell` re-implementations. Pass `href` to make it a clickable quick-link.
 */
export function StatCard({
  label,
  value,
  subline,
  icon,
  tone = "neutral",
  href,
  badge,
  className,
}: {
  label: string;
  value: React.ReactNode;
  subline?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  href?: string;
  badge?: React.ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  const toned = tone !== "neutral";

  const inner = (
    <Card
      className={cn(
        "h-full transition-colors",
        toned && cn("border-2", t.border, t.surface),
        href && "hover:bg-accent/40 cursor-pointer",
        className
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          {icon && (
            <span className={cn("shrink-0", t.icon)}>{icon}</span>
          )}
        </div>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className={cn("text-2xl font-semibold leading-none tracking-tight", toned && t.text)}>
            {value}
          </span>
          {badge}
        </div>
        {subline && <div className="mt-1 text-[11px] text-muted-foreground">{subline}</div>}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
        {inner}
      </Link>
    );
  }
  return inner;
}

/** Responsive grid wrapper for a row of StatCards — consistent gap everywhere. */
export function StatGrid({
  cols = 4,
  className,
  children,
}: {
  cols?: 2 | 3 | 4;
  className?: string;
  children: React.ReactNode;
}) {
  const colClass =
    cols === 2
      ? "grid-cols-1 sm:grid-cols-2"
      : cols === 3
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        : "grid-cols-2 lg:grid-cols-4";
  return <div className={cn("grid gap-3", colClass, className)}>{children}</div>;
}
