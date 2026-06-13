"use client";
/**
 * Inventory module's secondary sidebar (Petpooja-style).
 *
 * Renders a left rail with collapsible groups: Dashboard / Purchase / Manage Stock /
 * Consumption / Production / Reports / Masters / Settings. The active route auto-
 * expands its parent group; clicking a group header toggles expand. The "Back to
 * Billing" link returns to the main dashboard.
 */
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  ShoppingCart,
  ClipboardList,
  ArrowLeftRight,
  Trash2,
  Factory,
  BarChart3,
  Boxes,
  UtensilsCrossed,
  Store,
  Ruler,
  Sofa,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";

type Item = { label: string; href: string; icon?: LucideIcon };
type Group = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: Item[];
  href?: string;
  /** Roles allowed to see this group. Undefined = everyone with inventory
   *  access (i.e. anyone the parent layout lets in). When set, the sidebar
   *  intersects with the current user's role and hides groups they can't
   *  use — keeps the HODs from staring at Procurement + Reports they
   *  have no permission for. */
  allowedRoles?: readonly string[];
};

/**
 * Role → group whitelist for the inventory module's secondary sidebar.
 * Matches the flow chart spec:
 *   • HODs see only their dept dashboard + requisitions.
 *   • Store Manager runs procurement / requisitions / manage stock / etc.
 *   • Cost Controller stays in PO approval + reports.
 *   • Accountant lives in vendor invoices / GRN / payments.
 *   • Production Manager works production + manage stock.
 *   • Manager / Owner see everything.
 */
const HOD_GROUPS = ["dashboard", "requisitions"] as const;
const SM_GROUPS = ["dashboard", "purchase", "requisitions", "manage-stock", "consumption", "reports", "masters", "settings"] as const;
const CC_GROUPS = ["dashboard", "purchase", "reports"] as const;
const ACCT_GROUPS = ["dashboard", "purchase"] as const;
const PROD_GROUPS = ["dashboard", "production", "manage-stock", "masters"] as const;

const GROUPS: Group[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    href: "/inventory/dashboard",
    items: [],
  },
  {
    id: "purchase",
    label: "Procurement",
    icon: ShoppingCart,
    items: [
      { label: "Purchase Orders", href: "/inventory/purchase" },
      { label: "Goods received (GRN)", href: "/inventory/grn" },
      { label: "Vendor invoices", href: "/inventory/invoices" },
      { label: "Stock Purchase (legacy)", href: "/inventory/purchase-records" },
    ],
  },
  {
    id: "requisitions",
    label: "Requisitions",
    icon: ClipboardList,
    // Header itself navigates to the list. Sub-items are the two routes
    // most HODs / SMs reach for — opening the group with the chevron is
    // still supported, but the primary click goes to /inventory/requisitions
    // so the user doesn't get the "I clicked but nothing happened" effect.
    href: "/inventory/requisitions",
    items: [
      { label: "All requisitions", href: "/inventory/requisitions" },
      { label: "Raise new", href: "/inventory/requisitions/new" },
    ],
  },
  {
    id: "manage-stock",
    label: "Manage Stock",
    icon: ClipboardList,
    items: [
      { label: "Available Stock", href: "/inventory/available" },
      { label: "Closing Stock", href: "/inventory/closing" },
    ],
  },
  {
    id: "consumption",
    label: "Consumption",
    icon: ArrowLeftRight,
    items: [
      { label: "Transfer", href: "/inventory/transfers" },
      { label: "Wastage", href: "/inventory/wastage" },
      { label: "Stock movements", href: "/inventory/movements" },
    ],
  },
  {
    id: "production",
    label: "Production",
    icon: Factory,
    items: [
      { label: "Production", href: "/inventory/production" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: BarChart3,
    items: [
      { label: "Stock Summary", href: "/inventory/reports/summary" },
      { label: "Chain stock matrix", href: "/inventory/reports/chain-stock" },
      { label: "Requisition variance", href: "/inventory/reports/requisition-variance" },
      { label: "Procurement cockpit", href: "/inventory/reports/procurement-cockpit" },
    ],
  },
  {
    id: "masters",
    label: "Masters",
    icon: Boxes,
    items: [
      { label: "Raw Materials", href: "/inventory" },
      { label: "Recipes", href: "/inventory/recipes" },
      { label: "Suppliers", href: "/inventory/suppliers" },
      { label: "Units", href: "/inventory/units" },
    ],
  },
  {
    id: "assets",
    label: "Fixed Assets",
    icon: Sofa,
    items: [
      { label: "Register", href: "/inventory/assets" },
      { label: "Audits", href: "/inventory/assets/audits" },
      { label: "New audit", href: "/inventory/assets/audits/new" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: SettingsIcon,
    items: [
      { label: "Inventory Settings", href: "/inventory/settings" },
    ],
  },
];

/**
 * Map a role to the set of sidebar group ids it should see. Falling
 * through (Owner / Manager / unknown) returns null which means "show
 * every group".
 */
function allowedGroupsFor(role: string | undefined | null): Set<string> | null {
  if (!role) return null;
  switch (role) {
    case "CHEF_HOD":
    case "BARTENDER_HOD":
    case "HOUSEKEEPING_HOD":
      return new Set(HOD_GROUPS);
    case "STORE_MANAGER":
      return new Set(SM_GROUPS);
    case "COST_CONTROLLER":
      return new Set(CC_GROUPS);
    case "ACCOUNTANT":
      return new Set(ACCT_GROUPS);
    case "PRODUCTION_MANAGER":
      return new Set(PROD_GROUPS);
    default:
      return null;
  }
}

function isActiveHref(pathname: string, href: string) {
  // /inventory is the Raw Materials masters list — match exactly so it doesn't
  // light up for every /inventory/* route.
  if (href === "/inventory") return pathname === "/inventory";
  return pathname === href || pathname.startsWith(href + "/");
}

function groupContainsActive(pathname: string, g: Group) {
  if (g.href && isActiveHref(pathname, g.href)) return true;
  return g.items.some((i) => isActiveHref(pathname, i.href));
}

export function InventorySidebar({ userRole }: { userRole?: string | null }) {
  const pathname = usePathname() ?? "";
  // Filter to groups the role is allowed to see. The dashboard group's
  // own page already redirects HODs to /inventory/departments/[id] so
  // landing there is correct for them too.
  const allowed = allowedGroupsFor(userRole);
  const visibleGroups = React.useMemo(
    () => (allowed ? GROUPS.filter((g) => allowed.has(g.id)) : GROUPS),
    [allowed]
  );

  // A group is open if it contains the active route, or the user manually toggled it open.
  const initiallyOpen = React.useMemo(() => {
    const set = new Set<string>();
    for (const g of visibleGroups) if (groupContainsActive(pathname, g)) set.add(g.id);
    return set;
  }, [pathname, visibleGroups]);
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(initiallyOpen);
  React.useEffect(() => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      for (const g of visibleGroups) if (groupContainsActive(pathname, g)) next.add(g.id);
      return next;
    });
  }, [pathname, visibleGroups]);

  const toggle = (id: string) =>
    setOpenGroups((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <aside className="w-60 shrink-0 border-r bg-card h-[calc(100vh-3.5rem)] sticky top-14 overflow-y-auto">
      <Link
        href="/"
        className="flex items-center gap-2 px-4 py-3 border-b text-sm text-muted-foreground hover:bg-accent/50"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Billing
      </Link>

      <nav className="py-2">
        {visibleGroups.map((g) => {
          const Icon = g.icon;
          const isLeaf = !g.items.length && !!g.href;
          const isOpen = openGroups.has(g.id);
          const groupActive = groupContainsActive(pathname, g);

          if (isLeaf) {
            const active = isActiveHref(pathname, g.href!);
            return (
              <Link
                key={g.id}
                href={g.href!}
                className={cn(
                  "flex items-center gap-2.5 px-4 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-semibold border-l-2 border-primary -ml-px"
                    : "text-foreground hover:bg-accent/50"
                )}
              >
                <Icon className="h-4 w-4" />
                {g.label}
              </Link>
            );
          }

          return (
            <div key={g.id} className="text-sm">
              {/* When the group has its own href, the header text is a Link
                  (primary click navigates) and the chevron is a separate
                  toggle button. Without an href the whole row is the
                  toggle, same as before. */}
              {g.href ? (
                <div
                  className={cn(
                    "w-full flex items-center gap-2.5 px-4 py-2 transition-colors",
                    groupActive ? "text-primary font-semibold" : "text-foreground hover:bg-accent/50"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <Link
                    href={g.href}
                    className="flex-1 text-left hover:underline underline-offset-2"
                  >
                    {g.label}
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggle(g.id)}
                    title={isOpen ? "Collapse" : "Expand"}
                    className="p-0.5 -mr-1 hover:bg-accent/60 rounded"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => toggle(g.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-4 py-2 transition-colors",
                    groupActive ? "text-primary font-semibold" : "text-foreground hover:bg-accent/50"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{g.label}</span>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              )}
              {isOpen && (
                <ul className="pb-1">
                  {g.items.map((it) => {
                    const active = isActiveHref(pathname, it.href);
                    return (
                      <li key={it.href}>
                        <Link
                          href={it.href}
                          className={cn(
                            "block pl-12 pr-4 py-1.5 text-[13px] border-l ml-6 transition-colors",
                            active
                              ? "border-primary bg-primary/5 text-primary font-medium"
                              : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/40"
                          )}
                        >
                          {it.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
