"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Smart filter pill bar (audit §5.5) — replaces the slow date-picker pair with
 * Today / Yesterday / Last 7 / Last 30 / This Month / Last Month / Custom.
 * Stays as a thin client component; reads/writes ?range= on the URL.
 */
const OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7" },
  { value: "last30", label: "Last 30" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
];

export function RangePicker({ current }: { current: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  return (
    <div role="tablist" className="inline-flex flex-wrap items-center gap-1 rounded-full border bg-card p-0.5">
      {OPTIONS.map((o) => {
        const active = current === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              const next = new URLSearchParams(sp.toString());
              next.set("range", o.value);
              router.push(`?${next.toString()}`);
            }}
            className={cn(
              "text-xs px-2.5 py-1 rounded-full transition-colors",
              active
                ? "bg-primary text-primary-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
