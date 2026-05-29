import type { Role } from "@/lib/rbac";

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
  | "ListTodo";

export type NavItem = {
  label: string;
  href: string;
  icon?: IconName;
  soon?: boolean;
  /** Minimum role required to see this item. Omit = visible to anyone signed in. */
  minRole?: Role;
};
export type NavSection = { label: string; items: NavItem[]; minRole?: Role };

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/", icon: "LayoutDashboard" },
      { label: "Head Office", href: "/hq", icon: "Building2", minRole: "OWNER" },
    ],
  },
  {
    label: "Daily Operations",
    items: [
      { label: "Live Orders", href: "/orders/live", icon: "ShoppingBag" },
      { label: "All Orders", href: "/orders", icon: "ClipboardList" },
      { label: "New Bill", href: "/billing", icon: "Receipt" },
      { label: "KDS", href: "/kds", icon: "ChefHat" },
      { label: "KOT History", href: "/orders/kot", icon: "ClipboardList" },
      { label: "Day End", href: "/day-end", icon: "CalendarCheck", minRole: "MANAGER" },
      { label: "Due settlements", href: "/settlements", icon: "Receipt", minRole: "MANAGER" },
      { label: "Cash drawer", href: "/cash", icon: "Wallet" },
      { label: "Tasks", href: "/tasks", icon: "ListTodo" },
      { label: "Online Orders", href: "/orders/online", icon: "Globe2" },
    ],
  },
  {
    label: "Menu",
    items: [
      { label: "Menu Manager", href: "/menu", icon: "UtensilsCrossed" },
      { label: "Discounts", href: "/menu/discounts", icon: "Megaphone" },
      { label: "Tax masters", href: "/menu/taxes", icon: "Receipt" },
    ],
  },
  {
    label: "Inventory",
    items: [
      // Single entry; the page itself is a hub that fans out to every sub-module.
      { label: "Inventory", href: "/inventory/dashboard", icon: "Boxes" },
    ],
  },
  {
    label: "CRM",
    items: [
      { label: "Customers", href: "/customers", icon: "Users" },
      { label: "Feedback", href: "/feedback", icon: "Star" },
      { label: "Memberships", href: "/memberships", icon: "Star" },
      { label: "Gift cards", href: "/gift-cards", icon: "CreditCard", minRole: "MANAGER" },
      { label: "Campaigns", href: "/customers/campaigns", icon: "Megaphone", soon: true },
    ],
  },
  {
    label: "Accounting",
    items: [
      { label: "Expenses", href: "/expenses", icon: "Wallet" },
      { label: "Reconciliation", href: "/reconciliation", icon: "Receipt", minRole: "MANAGER" },
      { label: "Payments", href: "/payments", icon: "CreditCard", soon: true },
    ],
  },
  {
    label: "Reports",
    minRole: "MANAGER",
    items: [
      { label: "Reports Hub", href: "/reports", icon: "BarChart3", minRole: "MANAGER" },
      { label: "Day End Summary", href: "/day-end", icon: "CalendarCheck", minRole: "MANAGER" },
      { label: "Scheduled emails", href: "/reports/notifications", icon: "Bell", minRole: "MANAGER" },
    ],
  },
  {
    label: "Management",
    minRole: "MANAGER",
    items: [
      { label: "Override requests", href: "/overrides", icon: "ListChecks", minRole: "MANAGER" },
      { label: "Notifications", href: "/notifications", icon: "Bell", minRole: "MANAGER" },
      { label: "Audit trail", href: "/logs", icon: "ListChecks", minRole: "MANAGER" },
      { label: "Settings", href: "/settings", icon: "Settings", minRole: "MANAGER" },
      { label: "Sub-order types", href: "/settings/sub-types", icon: "Globe2", minRole: "MANAGER" },
      { label: "Users", href: "/settings/users", icon: "Users", minRole: "OWNER" },
      { label: "Outlets", href: "/outlets", icon: "Store", minRole: "OWNER" },
    ],
  },
];
