import { headers } from "next/headers";
import { NAV_SECTIONS } from "./nav-config";
import { getSessionUser } from "@/lib/session";
import { type Role } from "@/lib/rbac";
import { canAccess, loadOutletPermissions } from "@/lib/permissions";
import { getActiveOutlet } from "@/lib/outlet";
import { SidebarShell } from "./sidebar-shell";

export async function Sidebar() {
  const user = await getSessionUser();
  const role = (user?.role ?? "BILLER") as Role;

  // Load any per-outlet permission overrides from the RolePermission table
  // so the Owner's manual toggles take effect.
  let overrides = undefined;
  try {
    const outlet = await getActiveOutlet();
    overrides = await loadOutletPermissions(outlet.id);
  } catch {
    // Outlet lookup can fail at signup/login — fall back to defaults silently.
  }

  // Filter every nav item through the central permission registry. A section
  // disappears if every item in it is filtered out.
  const sections = NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => canAccess(role, i.pageId, overrides)),
  })).filter((s) => s.items.length > 0);

  // Active-route highlight from middleware-set header (initial SSR);
  // SidebarShell switches to client-side usePathname() after hydration.
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "/";

  return <SidebarShell sections={sections} role={role} pathname={pathname} />;
}
