import { headers } from "next/headers";
import { NAV_SECTIONS } from "./nav-config";
import { getSessionUser } from "@/lib/session";
import { type Role } from "@/lib/rbac";
import { canAccess, loadOutletPermissions } from "@/lib/permissions";
import { getActiveOutlet } from "@/lib/outlet";
import { db } from "@/lib/db";
import { SidebarShell } from "./sidebar-shell";

/**
 * Sections that are meaningless when the active outlet is a Base Store or
 * Base Kitchen — those locations don't have a POS, a menu, or customers.
 * Hiding them server-side gives BS/BK users a "slim" inventory-and-
 * procurement-only chrome, no matter what role they have.
 */
const SLIM_HIDDEN_SECTIONS = new Set(["Daily Operations", "Menu", "CRM"]);

export async function Sidebar() {
  const user = await getSessionUser();
  const role = (user?.role ?? "BILLER") as Role;

  // Load any per-outlet permission overrides from the RolePermission table
  // so the Owner's manual toggles take effect.
  let overrides = undefined;
  let badges: Record<string, number> = {};
  let kdsEnabled = true;
  let outletKind = "OUTLET";
  try {
    const outlet = await getActiveOutlet();
    overrides = await loadOutletPermissions(outlet.id);
    kdsEnabled = (outlet as any).kdsEnabled ?? true;
    outletKind = (outlet as any).kind ?? "OUTLET";
    // Per-section dynamic badges (audit §5.4 — Override pending count).
    const [pendingOverrides] = await Promise.all([
      db.overrideRequest.count({ where: { outletId: outlet.id, status: "PENDING" } }),
    ]);
    badges = { overrides: pendingOverrides };
  } catch {
    // Outlet lookup can fail at signup/login — fall back to defaults silently.
  }

  const isSlim = outletKind === "BASE_STORE" || outletKind === "BASE_KITCHEN";

  // Filter every nav item through the central permission registry. A section
  // disappears if every item in it is filtered out.
  const sections = NAV_SECTIONS
    // Skip POS/Menu/CRM sections wholesale for chain-level outlets — those
    // surfaces just don't exist at a warehouse / commissary.
    .filter((s) => !(isSlim && SLIM_HIDDEN_SECTIONS.has(s.label)))
    .map((s) => ({
      ...s,
      items: s.items
        .filter((i) => canAccess(role, i.pageId, overrides))
        // Hide KDS when the outlet has disabled it.
        .filter((i) => !(i.pageId === "kds" && !kdsEnabled))
        // Attach dynamic count badges where defined.
        .map((i) => (i.pageId === "overrides" && badges.overrides ? { ...i, badge: badges.overrides } : i)),
    }))
    .filter((s) => s.items.length > 0);

  // Active-route highlight from middleware-set header (initial SSR);
  // SidebarShell switches to client-side usePathname() after hydration.
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "/";

  return <SidebarShell sections={sections} role={role} pathname={pathname} />;
}
