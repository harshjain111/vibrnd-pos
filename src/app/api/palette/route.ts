/**
 * Command palette index — fast lookup of pages, items, customers, recent orders.
 *
 * Returns a small JSON snapshot for the Cmd-K modal. The client filters this
 * list in-memory with a fuzzy match, so we keep the response small (top ~50
 * per category). Refreshed on each open.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { getSessionUser } from "@/lib/session";
import { type Role } from "@/lib/rbac";
import { canAccess, loadOutletPermissions, PAGES } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ pages: [], items: [], customers: [], orders: [] });
  const role = user.role as Role;

  let overrides = undefined;
  let outletId = "";
  try {
    const outlet = await getActiveOutlet();
    outletId = outlet.id;
    overrides = await loadOutletPermissions(outlet.id);
  } catch {
    /* fall through to defaults */
  }

  // Pages the user can actually access.
  const pages = PAGES.filter((p) => canAccess(role, p.id, overrides)).map((p) => ({
    id: `page:${p.id}`,
    label: p.label,
    category: p.category,
    href: pageHref(p.id),
  }));

  const [items, customers, orders] = await Promise.all([
    outletId
      ? db.item.findMany({
          where: { outletId, active: true },
          select: { id: true, name: true, shortCode: true, price: true },
          orderBy: { name: "asc" },
          take: 50,
        })
      : Promise.resolve([]),
    outletId
      ? db.customer.findMany({
          where: { outletId },
          select: { id: true, name: true, phone: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
    outletId
      ? db.order.findMany({
          where: { outletId },
          select: { id: true, invoiceNo: true, grandTotal: true, status: true },
          orderBy: { createdAt: "desc" },
          take: 30,
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    pages,
    items: items.map((i) => ({ id: i.id, label: i.name, shortCode: i.shortCode, price: i.price, href: `/menu` })),
    customers: customers.map((c) => ({ id: c.id, label: c.name, phone: c.phone, href: `/customers/${c.id}` })),
    orders: orders.map((o) => ({ id: o.id, label: o.invoiceNo, status: o.status, grand: o.grandTotal, href: `/orders/${o.id}` })),
  });
}

/** Map a permissions PageId to a route. Mirrors what nav-config.ts declares. */
function pageHref(id: string): string {
  const map: Record<string, string> = {
    dashboard: "/",
    hq: "/hq",
    "orders.live": "/orders/live",
    "orders.all": "/orders",
    billing: "/billing",
    kds: "/kds",
    "orders.kot": "/orders/kot",
    "day-end": "/day-end",
    settlements: "/settlements",
    cash: "/cash",
    tasks: "/tasks",
    "orders.online": "/orders/online",
    "menu.manager": "/menu",
    "menu.discounts": "/menu/discounts",
    "menu.taxes": "/menu/taxes",
    "inventory.dashboard": "/inventory/dashboard",
    customers: "/customers",
    feedback: "/feedback",
    memberships: "/memberships",
    "gift-cards": "/gift-cards",
    "customers.campaigns": "/customers/campaigns",
    expenses: "/expenses",
    reconciliation: "/reconciliation",
    payments: "/payments",
    reports: "/reports",
    "reports.day-end": "/day-end",
    "reports.notifications": "/reports/notifications",
    overrides: "/overrides",
    notifications: "/notifications",
    logs: "/logs",
    settings: "/settings",
    "settings.sub-types": "/settings/sub-types",
    "settings.users": "/settings/users",
    "settings.permissions": "/settings/permissions",
    outlets: "/outlets",
  };
  return map[id] ?? "/";
}
