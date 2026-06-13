/**
 * Role constants only — safe to import from Client Components.
 *
 * `rbac.ts` re-exports these and adds the server-only helpers
 * (`requireUser`, etc.) that depend on `session.ts` (which pulls in
 * `next/headers`). When a "use client" file imports from `rbac.ts`
 * directly the production build fails because the server-only chain
 * gets pulled into the client bundle. This module is the import target
 * for client code that only needs the role list / type unions.
 */

export const POS_ROLES = ["OWNER", "MANAGER", "BILLER", "CAPTAIN", "RECEPTIONIST"] as const;
export const INVENTORY_ROLES = [
  "STORE_MANAGER",
  "COST_CONTROLLER",
  "CHEF_HOD",
  "BARTENDER_HOD",
  "HOUSEKEEPING_HOD",
  "ACCOUNTANT",
  "PRODUCTION_MANAGER",
] as const;
export const ROLES = [...POS_ROLES, ...INVENTORY_ROLES] as const;
export type PosRole = (typeof POS_ROLES)[number];
export type InventoryRole = (typeof INVENTORY_ROLES)[number];
export type Role = (typeof ROLES)[number];
