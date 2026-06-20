import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type FilterTab = {
  key: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
};

/**
 * Link-based segmented filter strip driven by a URL search param. Stays
 * server-component friendly (no client state) and replaces the bespoke tab
 * strips in purchase / invoices / requisitions. The `defaultKey` tab links to
 * the bare `basePath` (no param), matching existing "All" behaviour.
 */
export function FilterTabs({
  items,
  current,
  basePath,
  param = "tab",
  defaultKey,
  className,
}: {
  items: FilterTab[];
  current: string;
  basePath: string;
  param?: string;
  defaultKey?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map((t) => {
        const active = t.key === current;
        const href = t.key === defaultKey ? basePath : `${basePath}?${param}=${encodeURIComponent(t.key)}`;
        return (
          <Link
            key={t.key}
            href={href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground hover:bg-accent"
            )}
          >
            {t.icon}
            {t.label}
            {typeof t.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] leading-tight",
                  active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"
                )}
              >
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
