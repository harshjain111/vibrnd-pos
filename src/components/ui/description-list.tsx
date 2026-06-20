import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Label/value rows for detail-page summary panels. Replaces the duplicated
 * inline `Row` helpers in the PO and invoice detail pages.
 */
export function DescriptionList({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <dl className={cn("space-y-2 text-sm", className)}>{children}</dl>;
}

export function DescriptionRow({
  label,
  value,
  emphasis,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Renders a top border + larger weight — for the "grand total" style row. */
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3",
        emphasis && "border-t pt-2 text-base font-semibold",
        className
      )}
    >
      <dt className={cn(!emphasis && "text-muted-foreground")}>{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
