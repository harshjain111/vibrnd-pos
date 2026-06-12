"use client";
import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type DeptOption = {
  id: string;
  name: string;
  kind: string; // STORE | KITCHEN | BAR | HOUSEKEEPING | OTHER
};

/**
 * Department switcher pill shown at the top of every /inventory/* page when
 * the active outlet has multiDeptInventoryEnabled = true. Clicking a
 * department navigates to its per-department stock view at
 * `/inventory/departments/<id>` — one row per RawMaterial with its qty
 * AT that department, computed from the ledger.
 *
 * HOD-scoped users see only their own dept's pill (server-enforced anyway).
 */
export function DeptSwitcher({
  departments,
  currentDeptId,
  lockedToKind,
}: {
  departments: DeptOption[];
  currentDeptId: string | null;
  /** When set, the user can only see this dept-kind. The switcher renders
   *  as a read-only label instead of a clickable group. */
  lockedToKind?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const navigate = (id: string) => {
    router.push(`/inventory/departments/${id}`);
  };

  // Detect which dept is "currently" being viewed from the URL.
  const activeFromUrl = React.useMemo(() => {
    if (!pathname) return null;
    const m = pathname.match(/^\/inventory\/departments\/([^/?]+)/);
    return m?.[1] ?? null;
  }, [pathname]);
  const activeDept = currentDeptId ?? activeFromUrl;

  if (lockedToKind) {
    const locked = departments.find((d) => d.kind === lockedToKind);
    if (!locked) {
      return (
        <div className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Department</span>
          <span className="font-semibold">{lockedToKind}</span>
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => navigate(locked.id)}
        className="inline-flex items-center gap-1.5 rounded-full border bg-card hover:bg-accent px-3 py-1.5 text-xs transition-colors"
        title={`View ${locked.name} stock`}
      >
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Department</span>
        <span className="font-semibold">{locked.name}</span>
      </button>
    );
  }

  if (departments.length <= 1) return null;

  return (
    <div className="inline-flex items-center gap-1 rounded-full border bg-card p-1">
      <Building2 className="h-3.5 w-3.5 text-muted-foreground ml-1.5 mr-0.5" />
      {departments.map((d) => {
        const active = d.id === activeDept;
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => navigate(d.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs transition-colors",
              active ? "bg-primary text-primary-foreground" : "hover:bg-accent text-foreground"
            )}
            title={`View ${d.name} stock`}
          >
            {d.name}
          </button>
        );
      })}
    </div>
  );
}
