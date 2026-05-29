import { headers } from "next/headers";
import { NAV_SECTIONS } from "./nav-config";
import { getSessionUser } from "@/lib/session";
import { hasAtLeast, type Role } from "@/lib/rbac";
import { SidebarShell } from "./sidebar-shell";

export async function Sidebar() {
  const user = await getSessionUser();
  const role = (user?.role ?? "BILLER") as Role;

  // Role-filter sections + items
  const sections = NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.minRole || hasAtLeast(role, i.minRole)),
  })).filter((s) => s.items.length > 0 && (!s.minRole || hasAtLeast(role, s.minRole)));

  // Active-route highlight from middleware-set header
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "/";

  return <SidebarShell sections={sections} role={role} pathname={pathname} />;
}
