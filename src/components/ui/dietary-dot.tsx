import { cn } from "@/lib/utils";

/**
 * 4-way dietary marker per audit TASK 4. Drawn as the FSSAI square symbol:
 *   VEG (green) · NON_VEG (red) · EGG (yellow) · JAIN (saffron orange).
 */
export type Dietary = "VEG" | "NON_VEG" | "EGG" | "JAIN";

export function DietaryDot({
  value,
  size = "sm",
  className,
}: {
  value: Dietary | string;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const colors: Record<string, { border: string; fill: string; label: string }> = {
    VEG:     { border: "border-emerald-600", fill: "bg-emerald-600", label: "Vegetarian" },
    NON_VEG: { border: "border-rose-600",    fill: "bg-rose-600",    label: "Non-vegetarian" },
    EGG:     { border: "border-amber-500",   fill: "bg-amber-500",   label: "Contains egg" },
    JAIN:    { border: "border-orange-500",  fill: "bg-orange-500",  label: "Jain" },
  };
  const c = colors[value] ?? colors.VEG;
  const box = size === "xs" ? "h-2.5 w-2.5" : size === "md" ? "h-4 w-4" : "h-3 w-3";
  const dot = size === "xs" ? "h-1 w-1" : size === "md" ? "h-2 w-2" : "h-1.5 w-1.5";
  return (
    <span
      title={c.label}
      className={cn("rounded-sm border flex items-center justify-center shrink-0", box, c.border, className)}
    >
      <span className={cn("rounded-full", dot, c.fill)} />
    </span>
  );
}
