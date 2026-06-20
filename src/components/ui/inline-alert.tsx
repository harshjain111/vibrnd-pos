import * as React from "react";
import { cn } from "@/lib/utils";
import { TONE, type Tone } from "@/lib/ui-tone";

/**
 * A bordered, soft-surface banner for inline status/context messages.
 * Replaces the 20+ hand-styled `Card` banners (rejection / approval / warning /
 * info) that each hardcoded their own border+bg shades.
 */
export function InlineAlert({
  tone = "info",
  icon,
  title,
  action,
  className,
  children,
}: {
  tone?: Tone;
  icon?: React.ReactNode;
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div
      className={cn(
        "rounded-lg border-2 p-3 flex items-start gap-2.5 text-sm",
        t.border,
        t.surface,
        className
      )}
    >
      {icon && <span className={cn("mt-0.5 shrink-0", t.icon)}>{icon}</span>}
      <div className="flex-1 min-w-0">
        {title && <div className={cn("font-semibold", t.text)}>{title}</div>}
        {children && <div className="text-foreground/90 mt-0.5">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
