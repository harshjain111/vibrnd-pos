/**
 * Department-scoped catalog filter — gate which raw materials an HOD sees.
 *
 * RawMaterial.allowedDepartments is a CSV of department kinds
 * (KITCHEN | BAR | HOUSEKEEPING | STORE). NULL or empty means the item
 * is universally available — that's the default for staples like salt or
 * packaging that every department uses. Otherwise the item is restricted
 * to the listed kinds and HOD-facing pages filter through this.
 *
 * Returns a Prisma `where` fragment caller-merges into their query, or
 * `undefined` for roles that don't own a department (Manager, Owner, the
 * accountant track) — they keep seeing the full catalog.
 */
import type { Prisma } from "@prisma/client";
import { ownedDepartmentKind } from "./rbac";

export const DEPARTMENT_KINDS = ["STORE", "KITCHEN", "BAR", "HOUSEKEEPING"] as const;
export type DepartmentKind = (typeof DEPARTMENT_KINDS)[number];

/** True when the role owns a specific dept (any HOD or the Store Manager). */
export function isDepartmentScopedRole(role: string): boolean {
  return ownedDepartmentKind(role) !== null;
}

/**
 * Prisma-friendly `where` fragment that hides items the caller's
 * department can't request. Composes via `AND` with the rest of the
 * caller's where clause.
 *
 * Implementation note: `allowedDepartments` is a CSV stored as TEXT so
 * we use a `contains` substring match. Department kinds (STORE,
 * KITCHEN, BAR, HOUSEKEEPING) don't share substrings so false positives
 * aren't possible.
 */
export function rmDepartmentFilter(
  role: string | undefined | null
): Prisma.RawMaterialWhereInput | undefined {
  if (!role) return undefined;
  const kind = ownedDepartmentKind(role);
  if (!kind) return undefined;
  return {
    OR: [
      { allowedDepartments: null },
      { allowedDepartments: "" },
      { allowedDepartments: { contains: kind } },
    ],
  };
}

/** Parse the stored CSV into a clean set of kinds — for UI render. */
export function parseAllowedDepartments(csv: string | null | undefined): Set<DepartmentKind> {
  if (!csv || !csv.trim()) return new Set();
  return new Set(
    csv
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s): s is DepartmentKind => (DEPARTMENT_KINDS as readonly string[]).includes(s))
  );
}

/** Serialise a set of kinds back to the canonical CSV. Empty set → null. */
export function serialiseAllowedDepartments(set: Set<DepartmentKind> | DepartmentKind[]): string | null {
  const arr = Array.isArray(set) ? set : [...set];
  if (arr.length === 0) return null;
  // Canonical order so the same selection always serialises identically.
  return DEPARTMENT_KINDS.filter((k) => arr.includes(k)).join(",");
}
