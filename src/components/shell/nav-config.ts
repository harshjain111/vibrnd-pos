import type { PageId } from "@/lib/permissions";

/**
 * Icon is referenced by *name* (not a function) so this config is safe to pass
 * across the Server → Client component boundary. The Sidebar item component
 * looks up the actual lucide-react component via `getIcon()`.
 */
export type IconName =
  | "LayoutDashboard"
  | "ShoppingBag"
  | "ClipboardList"
  | "Globe2"
  | "Receipt"
  | "CreditCard"
  | "UtensilsCrossed"
  | "Boxes"
  | "Megaphone"
  | "BarChart3"
  | "Users"
  | "Wallet"
  | "Settings"
  | "Store"
  | "ChefHat"
  | "CalendarCheck"
  | "ListChecks"
  | "Bell"
  | "AlertTriangle"
  | "Building2"
  | "Star"
  | "ListTodo"
  | "PackageCheck"
  | "FileText"
  | "Shield";

export type NavItem = {
  label: string;
  href: string;
  icon?: IconName;
  soon?: boolean;
  /** Page in the central permission registry. The sidebar hides items the user can't access. */
  pageId: PageId;
  /** Optional count badge — set dynamically by the server sidebar (e.g. pending overrides). */
  badge?: number;
};
export type NavSection = { label: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/", icon: "LayoutDashboard", pageId: "dashboard" },
      { label: "Head Office", href: "/hq", icon: "Building2", pageId: "hq" },
    ],
  },
  {
    label: "Daily Operations",
    items: [
      { label: "Live Orders", href: "/orders/live", icon: "ShoppingBag", pageId: "orders.live" },
      { label: "All Orders", href: "/orders", icon: "ClipboardList", pageId: "orders.all" },
      { label: "New Bill", href: "/billing", icon: "Receipt", pageId: "billing" },
      { label: "KDS", href: "/kds", icon: "ChefHat", pageId: "kds" },
      { label: "KOT History", href: "/orders/kot", icon: "ClipboardList", pageId: "orders.kot" },
      { label: "Day End", href: "/day-end", icon: "CalendarCheck", pageId: "day-end" },
      { label: "Due settlements", href: "/settlements", icon: "Receipt", pageId: "settlements" },
      { label: "Cash drawer", href: "/cash", icon: "Wallet", pageId: "cash" },
      { label: "Tasks", href: "/tasks", icon: "ListTodo", pageId: "tasks" },
      { label: "Online Orders", href: "/orders/online", icon: "Globe2", pageId: "orders.online" },
    ],
  },
  {
    label: "Menu",
    items: [
      { label: "Menu Manager", href: "/menu", icon: "UtensilsCrossed", pageId: "menu.manager" },
      { label: "Discounts", href: "/menu/discounts", icon: "Megaphone", pageId: "menu.discounts" },
      { label: "Tax masters", href: "/menu/taxes", icon: "Receipt", pageId: "menu.taxes" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { label: "Inventory", href: "/inventory/dashboard", icon: "Boxes", pageId: "inventory.dashboard" },
      { label: "Requisitions", href: "/inventory/requisitions", icon: "ClipboardList", pageId: "inventory.requisitions" },
      { label: "Goods received", href: "/inventory/grn", icon: "PackageCheck", pageId: "inventory.grn" },
      { label: "Vendor invoices", href: "/inventory/invoices", icon: "FileText", pageId: "inventory.invoices" },
      { label: "Production", href: "/inventory/production", icon: "ChefHat", pageId: "inventory.production" },
    ],
  },
  {
    label: "CRM",
    items: [
      { label: "Customers", href: "/customers", icon: "Users", pageId: "customers" },
      { label: "Feedback", href: "/feedback", icon: "Star", pageId: "feedback" },
      { label: "Memberships", href: "/memberships", icon: "Star", pageId: "memberships" },
      { label: "Gift cards", href: "/gift-cards", icon: "CreditCard", pageId: "gift-cards" },
      { label: "Campaigns", href: "/customers/campaigns", icon: "Megaphone", soon: true, pageId: "customers.campaigns" },
    ],
  },
  {
    label: "Accounting",
    items: [
      { label: "Expenses", href: "/expenses", icon: "Wallet", pageId: "expenses" },
      { label: "Reconciliation", href: "/reconciliation", icon: "Receipt", pageId: "reconciliation" },
      { label: "Payments", href: "/payments", icon: "CreditCard", soon: true, pageId: "payments" },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "Reports Hub", href: "/reports", icon: "BarChart3", pageId: "reports" },
      { label: "Day End Summary", href: "/day-end", icon: "CalendarCheck", pageId: "reports.day-end" },
      { label: "Scheduled emails", href: "/reports/notifications", icon: "Bell", pageId: "reports.notifications" },
    ],
  },
  {
    label: "Management",
    items: [
      { label: "Override requests", href: "/overrides", icon: "ListChecks", pageId: "overrides" },
      { label: "Notifications", href: "/notifications", icon: "Bell", pageId: "notifications" },
      { label: "Audit trail", href: "/logs", icon: "ListChecks", pageId: "logs" },
      { label: "Settings", href: "/settings", icon: "Settings", pageId: "settings" },
      { label: "Sub-order types", href: "/settings/sub-types", icon: "Globe2", pageId: "settings.sub-types" },
      { label: "Floor plan", href: "/settings/floor-plan", icon: "Store", pageId: "settings.floor-plan" },
      { label: "Users", href: "/settings/users", icon: "Users", pageId: "settings.users" },
      { label: "Permissions", href: "/settings/permissions", icon: "Shield", pageId: "settings.permissions" },
      { label: "Outlets", href: "/outlets", icon: "Store", pageId: "outlets" },
    ],
  },
];
