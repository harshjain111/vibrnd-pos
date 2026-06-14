/**
 * Page-level Role-Based Access Control (RBAC).
 *
 * Single source of truth for "who can see what":
 *   PAGES — every navigable page, its label, and the DEFAULT set of roles that can access it.
 *   canAccess(role, pageId) — checks the default + any per-outlet override stored in RolePermission.
 *
 * Owners can flip any role × page on/off via /settings/permissions without code changes.
 */
import { db } from "./db";
import type { Role } from "./rbac";

export type PageId =
  // Overview
  | "dashboard"
  | "hq"
  // Daily Operations
  | "orders.live"
  | "orders.all"
  | "billing"
  | "kds"
  | "orders.kot"
  | "day-end"
  | "settlements"
  | "cash"
  | "tasks"
  | "orders.online"
  // POS action-level permissions — gate the special actions on the bill /
  // table, mirroring the role-access matrix. Receptionist owns the
  // assign-table flow; captains take orders + send KOTs; cashiers (BILLER)
  // do moves / splits / comp / customer edits; managers add void.
  | "pos.action.assign_table"
  | "pos.action.punch_order"
  | "pos.action.generate_kot"
  | "pos.action.view_open_tables"
  | "pos.action.move_table"
  | "pos.action.split_bill"
  | "pos.action.change_customer"
  | "pos.action.item_shift"
  | "pos.action.complimentary"
  | "pos.action.void_item"
  | "pos.action.discount"
  | "pos.action.print_bill"
  | "pos.action.settle_bill"
  | "pos.action.payment_collection"
  // Menu
  | "menu.manager"
  | "menu.discounts"
  | "menu.taxes"
  // Inventory
  | "inventory.dashboard"
  | "inventory.departments"
  | "inventory.requisitions"
  | "inventory.requisitions.approve"
  | "inventory.purchase.approve"
  | "inventory.grn"
  | "inventory.invoices"
  | "inventory.payments"
  | "inventory.production"
  | "inventory.reports.chain-stock"
  | "inventory.reports.requisition-variance"
  | "inventory.reports.procurement-cockpit"
  // CRM
  | "customers"
  | "feedback"
  | "memberships"
  | "gift-cards"
  | "customers.campaigns"
  // Accounting
  | "expenses"
  | "reconciliation"
  | "payments"
  // Reports
  | "reports"
  | "reports.day-end"
  | "reports.notifications"
  // Management
  | "overrides"
  | "notifications"
  | "logs"
  | "settings"
  | "settings.sub-types"
  | "settings.users"
  | "settings.permissions"
  | "settings.floor-plan"
  | "outlets";

export type PageDef = {
  id: PageId;
  label: string;
  category: string;
  /** Default roles allowed to access this page. */
  defaultRoles: Role[];
  /** When true, even an Owner override cannot grant access (hard-coded ownership). */
  ownerOnly?: boolean;
};

/**
 * Default access matrix. Tighter than the previous minRole-only model:
 *   • CAPTAIN — takes orders, manages customers (in-restaurant waitstaff)
 *   • BILLER — settles bills, cash drawer, customers, memberships, expenses (cashier)
 *   • MANAGER — operations, reports, inventory, approvals (everything except user/outlet/permission management)
 *   • OWNER — full access
 */
export const PAGES: PageDef[] = [
  // Overview
  { id: "dashboard", label: "Dashboard", category: "Overview", defaultRoles: ["MANAGER", "OWNER"] },
  { id: "hq", label: "Head Office", category: "Overview", defaultRoles: ["OWNER"], ownerOnly: true },

  // Daily Operations — billers/captains/receptionists live here
  { id: "billing", label: "New Bill", category: "Daily Operations", defaultRoles: ["RECEPTIONIST", "CAPTAIN", "BILLER", "MANAGER", "OWNER"] },
  { id: "orders.live", label: "Live Orders", category: "Daily Operations", defaultRoles: ["RECEPTIONIST", "CAPTAIN", "BILLER", "MANAGER", "OWNER"] },
  { id: "orders.all", label: "All Orders", category: "Daily Operations", defaultRoles: ["BILLER", "MANAGER", "OWNER"] },
  { id: "kds", label: "KDS", category: "Daily Operations", defaultRoles: ["BILLER", "MANAGER", "OWNER"] },
  { id: "orders.kot", label: "KOT History", category: "Daily Operations", defaultRoles: ["MANAGER", "OWNER"] },
  { id: "day-end", label: "Day End", category: "Daily Operations", defaultRoles: ["MANAGER", "OWNER"] },
  { id: "settlements", label: "Due settlements", category: "Daily Operations", defaultRoles: ["BILLER", "MANAGER", "OWNER"] },
  { id: "cash", label: "Cash drawer", category: "Daily Operations", defaultRoles: ["BILLER", "MANAGER", "OWNER"] },
  { id: "tasks", label: "Tasks", category: "Daily Operations", defaultRoles: ["RECEPTIONIST", "CAPTAIN", "BILLER", "MANAGER", "OWNER"] },
  { id: "orders.online", label: "Online Orders", category: "Daily Operations", defaultRoles: ["MANAGER", "OWNER"] },

  // POS action-level permissions — these don't represent pages, they gate
  // buttons on /billing and /orders/[id] using canAccess(). Default matrix
  // matches the spec: receptionists register customers + assign tables,
  // captains punch + KOT, billers (cashier) do moves/splits/comp/customer,
  // managers add void. Each entry stays toggleable from /settings/permissions
  // so an outlet owner can flip a row at will.
  // Defaults are the 13-row matrix from the spec image, verbatim:
  //   Captain  ✓ Punch / KOT / View Open / Print
  //   Cashier  ✓ everything Captain has  + Move/Split/Change/Item-shift/Comp/Settle/Payment
  //   Manager  ✓ everything Cashier has  + Void/Discount
  //   Receptionist owns the assign-table flow (box 1 in the spec).
  { id: "pos.action.assign_table",       label: "Assign customer to table",   category: "POS actions", defaultRoles: ["RECEPTIONIST", "BILLER", "MANAGER", "OWNER"] },
  { id: "pos.action.punch_order",        label: "Punch orders",               category: "POS actions", defaultRoles: ["CAPTAIN", "BILLER", "MANAGER", "OWNER"] },
  { id: "pos.action.generate_kot",       label: "Generate KOT",               category: "POS actions", defaultRoles: ["CAPTAIN", "BILLER", "MANAGER", "OWNER"] },
  { id: "pos.action.view_open_tables",   label: "View open tables",           category: "POS actions", defaultRoles: ["RECEPTIONIST", "CAPTAIN", "BILLER", "MANAGER", "OWNER"] },
  { id: "pos.action.move_table",         label: "Move table",                 category: "POS actions", defaultRoles: ["BILLER", "MANAGER", "OWNER"] },
  { id: "pos.action.split_bill",         label: "Split bill",                 category: "POS actions", defaultRoles: ["BILLER", "MANAGER", "OWNER"] },
  { id: "pos.action.change_customer",    label: "Change customer name",       category: "POS actions", defaultRoles: ["BILLER", "MANAGER", "OWNER"] },
  { id: "pos.action.item_shift",         label: "Shift items between tables", category: "POS actions", defaultRoles: ["BILLER", "MANAGER", "OWNER"] },
  { id: "pos.action.complimentary",      label: "Complimentary item / order", category: "POS actions", defaultRoles: ["BILLER", "MANAGER", "OWNER"] },
  { id: "pos.action.print_bill",         label: "Print bill",                 category: "POS actions", defaultRoles: ["CAPTAIN", "BILLER", "MANAGER", "OWNER"] },
  { id: "pos.action.settle_bill",        label: "Settle bill",                category: "POS actions", defaultRoles: ["BILLER", "MANAGER", "OWNER"] },
  { id: "pos.action.payment_collection", label: "Payment collection",         category: "POS actions", defaultRoles: ["BILLER", "MANAGER", "OWNER"] },
  { id: "pos.action.void_item",          label: "Void item (post-KOT)",       category: "POS actions", defaultRoles: ["MANAGER", "OWNER"] },
  { id: "pos.action.discount",           label: "Apply discount",             category: "POS actions", defaultRoles: ["MANAGER", "OWNER"] },

  // Menu — managers and owners only
  { id: "menu.manager", label: "Menu Manager", category: "Menu", defaultRoles: ["MANAGER", "OWNER"] },
  { id: "menu.discounts", label: "Discounts", category: "Menu", defaultRoles: ["MANAGER", "OWNER"] },
  { id: "menu.taxes", label: "Tax masters", category: "Menu", defaultRoles: ["MANAGER", "OWNER"] },

  // Inventory — managers + owners + the 7 new inventory roles
  { id: "inventory.dashboard", label: "Inventory", category: "Inventory", defaultRoles: ["STORE_MANAGER", "COST_CONTROLLER", "CHEF_HOD", "BARTENDER_HOD", "HOUSEKEEPING_HOD", "ACCOUNTANT", "PRODUCTION_MANAGER", "MANAGER", "OWNER"] },

  // Chain inventory (Prompt 1) — fine-grained pages per workflow
  { id: "inventory.departments", label: "Departments", category: "Inventory", defaultRoles: ["MANAGER", "OWNER"] },
  { id: "inventory.requisitions", label: "Requisitions", category: "Inventory", defaultRoles: ["CHEF_HOD", "BARTENDER_HOD", "HOUSEKEEPING_HOD", "STORE_MANAGER", "MANAGER", "OWNER"] },
  { id: "inventory.requisitions.approve", label: "Approve requisitions", category: "Inventory", defaultRoles: ["STORE_MANAGER", "MANAGER", "OWNER"] },
  { id: "inventory.purchase.approve", label: "Approve POs", category: "Inventory", defaultRoles: ["COST_CONTROLLER", "OWNER"] },
  { id: "inventory.grn", label: "Goods received notes", category: "Inventory", defaultRoles: ["STORE_MANAGER", "ACCOUNTANT", "MANAGER", "OWNER"] },
  { id: "inventory.invoices", label: "Vendor invoices", category: "Inventory", defaultRoles: ["ACCOUNTANT", "OWNER"] },
  { id: "inventory.payments", label: "Vendor payments", category: "Inventory", defaultRoles: ["ACCOUNTANT", "OWNER"] },
  { id: "inventory.production", label: "Production", category: "Inventory", defaultRoles: ["PRODUCTION_MANAGER", "MANAGER", "OWNER"] },
  { id: "inventory.reports.chain-stock", label: "Chain stock matrix", category: "Inventory", defaultRoles: ["MANAGER", "OWNER"] },
  { id: "inventory.reports.requisition-variance", label: "Requisition variance", category: "Inventory", defaultRoles: ["MANAGER", "OWNER", "STORE_MANAGER"] },
  { id: "inventory.reports.procurement-cockpit", label: "Procurement cockpit", category: "Inventory", defaultRoles: ["COST_CONTROLLER", "OWNER", "MANAGER"] },

  // CRM
  { id: "customers", label: "Customers", category: "CRM", defaultRoles: ["RECEPTIONIST", "CAPTAIN", "BILLER", "MANAGER", "OWNER"] },
  { id: "feedback", label: "Feedback", category: "CRM", defaultRoles: ["MANAGER", "OWNER"] },
  { id: "memberships", label: "Memberships", category: "CRM", defaultRoles: ["BILLER", "MANAGER", "OWNER"] },
  { id: "gift-cards", label: "Gift cards", category: "CRM", defaultRoles: ["MANAGER", "OWNER"] },
  { id: "customers.campaigns", label: "Campaigns", category: "CRM", defaultRoles: ["MANAGER", "OWNER"] },

  // Accounting
  { id: "expenses", label: "Expenses", category: "Accounting", defaultRoles: ["BILLER", "MANAGER", "OWNER"] },
  { id: "reconciliation", label: "Reconciliation", category: "Accounting", defaultRoles: ["MANAGER", "OWNER"] },
  { id: "payments", label: "Payments", category: "Accounting", defaultRoles: ["MANAGER", "OWNER"] },

  // Reports
  { id: "reports", label: "Reports Hub", category: "Reports", defaultRoles: ["MANAGER", "OWNER"] },
  { id: "reports.day-end", label: "Day End Summary", category: "Reports", defaultRoles: ["MANAGER", "OWNER"] },
  { id: "reports.notifications", label: "Scheduled emails", category: "Reports", defaultRoles: ["MANAGER", "OWNER"] },

  // Management
  { id: "overrides", label: "Override requests", category: "Management", defaultRoles: ["MANAGER", "OWNER"] },
  { id: "notifications", label: "Notifications", category: "Management", defaultRoles: ["MANAGER", "OWNER"] },
  { id: "logs", label: "Audit trail", category: "Management", defaultRoles: ["MANAGER", "OWNER"] },
  { id: "settings", label: "Settings", category: "Management", defaultRoles: ["MANAGER", "OWNER"] },
  { id: "settings.sub-types", label: "Sub-order types", category: "Management", defaultRoles: ["MANAGER", "OWNER"] },
  { id: "settings.floor-plan", label: "Floor plan", category: "Management", defaultRoles: ["MANAGER", "OWNER"] },
  { id: "settings.users", label: "Users", category: "Management", defaultRoles: ["OWNER"], ownerOnly: true },
  { id: "settings.permissions", label: "Permissions", category: "Management", defaultRoles: ["OWNER"], ownerOnly: true },
  { id: "outlets", label: "Outlets", category: "Management", defaultRoles: ["OWNER"], ownerOnly: true },
];

const PAGE_MAP = new Map(PAGES.map((p) => [p.id, p] as const));

export function findPage(id: PageId): PageDef | undefined {
  return PAGE_MAP.get(id);
}

/** Override map keyed by `${role}:${pageId}` → allowed boolean. */
export type OverrideMap = Map<string, boolean>;

/** Load all per-outlet permission overrides for a single outlet. */
export async function loadOutletPermissions(outletId: string): Promise<OverrideMap> {
  const rows = await db.rolePermission.findMany({ where: { outletId } });
  const map: OverrideMap = new Map();
  for (const r of rows) map.set(`${r.role}:${r.pageId}`, r.allowed);
  return map;
}

/** Check if a role can access a page, taking per-outlet overrides into account. */
export function canAccess(role: Role | string, pageId: PageId, overrides?: OverrideMap): boolean {
  const page = PAGE_MAP.get(pageId);
  if (!page) return false;
  // Owner-only pages can never be granted to lower roles via override.
  if (page.ownerOnly && role !== "OWNER") return false;
  // Check the override first; if absent, fall back to the default.
  const override = overrides?.get(`${role}:${pageId}`);
  if (override !== undefined) return override;
  return page.defaultRoles.includes(role as Role);
}
