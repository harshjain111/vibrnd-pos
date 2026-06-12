/**
 * Where each role lands by default after login (or when they click the
 * Vibrnd logo / hit `/`). Inventory + procurement roles land directly in
 * their own work surface instead of the operations dashboard.
 */
import type { Role } from "./rbac";

export function landingPathFor(role: Role | string): string {
  switch (role) {
    case "CHEF_HOD":
    case "BARTENDER_HOD":
    case "HOUSEKEEPING_HOD":
      // HODs spend most of their day raising requisitions to the store.
      return "/inventory/requisitions/new";
    case "STORE_MANAGER":
      // SM lives in the approval queue + the PO module.
      return "/inventory/requisitions";
    case "COST_CONTROLLER":
      // CC reviews POs awaiting approval.
      return "/inventory/purchase?status=pending-cc";
    case "ACCOUNTANT":
      // AP work starts from GRNs received but not yet invoiced.
      return "/inventory/grn";
    case "PRODUCTION_MANAGER":
      // Production runs at the Base Kitchen.
      return "/inventory/production";
    case "CAPTAIN":
    case "BILLER":
      // POS roles go straight to the New Bill screen.
      return "/billing";
    default:
      // OWNER + MANAGER + anything unrecognised lands on the dashboard.
      return "/";
  }
}
