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
      // HODs land on the focused box-#4 dashboard — current stock, low
      // stock alerts, replenishment list, and pending reqs — with the
      // "New requisition" CTA front-and-centre.
      return "/inventory/dashboard";
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
    case "RECEPTIONIST":
      // Receptionist owns the floor plan — register customers + assign
      // tables — so we drop them on the live grid.
      return "/orders/live";
    case "CAPTAIN":
      // Captains land on the floor plan so the very first thing they
      // see is the table(s) the receptionist handed off to them — a
      // pinned "My tables waiting" banner sits at the top, plus their
      // tiles glow primary on the grid.
      return "/orders/live";
    case "BILLER":
      // Cashier hops between settle queue + new bills; New Bill is the
      // most common starting task so we drop them there.
      return "/billing";
    default:
      // OWNER + MANAGER + anything unrecognised lands on the dashboard.
      return "/";
  }
}
