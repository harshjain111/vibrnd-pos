import { InventorySidebar } from "./_components/inv-sidebar";
import { getActiveOutlet } from "@/lib/outlet";
import { getSessionUser } from "@/lib/session";

/**
 * Nests every `/inventory/*` route under a two-pane layout: an inventory-specific
 * secondary sidebar on the left, page content on the right. Mirrors the
 * Petpooja-style module nav so users find every inventory sub-page from one place.
 *
 * The sidebar is role-filtered (HODs see fewer groups than the Store Manager /
 * Owner) so it needs the current user's role.
 */
export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  let userRole: string | null = null;

  try {
    // Touch the active outlet so the layout still fails closed pre-login,
    // matching every other /inventory page.
    await getActiveOutlet();
    const user = await getSessionUser();
    userRole = user?.role ?? null;
  } catch {
    // Pre-login renders fall through to the un-decorated layout.
  }

  return (
    <div className="-m-4 md:-m-6 flex min-h-[calc(100vh-3.5rem)]">
      <InventorySidebar userRole={userRole} />
      <div className="flex-1 min-w-0 p-4 md:p-6">{children}</div>
    </div>
  );
}
