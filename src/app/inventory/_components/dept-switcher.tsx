"use client";
import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type DeptOption = {
  id: string;
  name: string;
  kind: string; // STORE | KITCHEN | BAR | HOUSEKEEPING | OTHER
};

/**
 * Department switcher pill shown at the top of every /inventory/* page when
 * the active outlet has multiDeptInventoryEnabled = true. Lets a Manager
 * or Owner pivot which department's stock they're viewing without leaving
 * the current page. HOD-scoped users see only their own dept (and the
 * server enforces the scoping anyway).
 *
 * Selection is persisted via the `dept=<id>` querystring so deep links work
 * and so refresh keeps the choice. No cookie, no global state.
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
  const sp = useSearchParams();

  const setDept = (id: string) => {
    const next = new URLSearchParams(sp?.toString() ?? "");
    next.set("dept", id);
    router.push(`${pathname}?${next.toString()}`);
  };

  if (lockedToKind) {
    const locked = departments.find((d) => d.kind === lockedToKind);
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Department</span>
        <span className="font-semibold">{locked?.name ?? lockedToKind}</span>
      </div>
    );
  }

  if (departments.length <= 1) return null;

  return (
    <div className="inline-flex items-center gap-1 rounded-full border bg-card p-1">
      <Building2 className="h-3.5 w-3.5 text-muted-foreground ml-1.5 mr-0.5" />
      {departments.map((d) => {
        const active = d.id === currentDeptId;
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => setDept(d.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs transition-colors",
              active ? "bg-primary text-primary-foreground" : "hover:bg-accent text-foreground"
            )}
            title={`Switch to ${d.name}`}
          >
            {d.name}
          </button>
        );
      })}
    </div>
  );
}
