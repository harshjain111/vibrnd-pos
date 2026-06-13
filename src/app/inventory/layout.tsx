import { InventorySidebar } from "./_components/inv-sidebar";
import { DeptSwitcher, type DeptOption } from "./_components/dept-switcher";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { getSessionUser } from "@/lib/session";
import { ownedDepartmentKind } from "@/lib/rbac";

/**
 * Nests every `/inventory/*` route under a two-pane layout: an inventory-specific
 * secondary sidebar on the left, page content on the right. Mirrors the
 * Petpooja-style module nav so users find every inventory sub-page from one place.
 *
 * Also renders the department switcher pill at the top of the right pane when
 * the active outlet has multi-department inventory enabled. The switcher is
 * locked to the role's department for HODs so they can't peek into other depts.
 */
export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  let departments: DeptOption[] = [];
  let lockedToKind: string | null = null;
  let multiDeptEnabled = false;
  let userRole: string | null = null;

  try {
    const outlet = await getActiveOutlet();
    multiDeptEnabled = (outlet as any).multiDeptInventoryEnabled ?? true;
    if (multiDeptEnabled) {
      const rows = await db.department.findMany({
        where: { outletId: outlet.id, active: true },
        orderBy: { kind: "asc" },
      });
      departments = rows.map((d) => ({ id: d.id, name: d.name, kind: d.kind }));
    }
    const user = await getSessionUser();
    lockedToKind = user ? ownedDepartmentKind(user.role) : null;
    userRole = user?.role ?? null;
  } catch {
    // Pre-login renders fall through to the un-decorated layout.
  }

  return (
    <div className="-m-4 md:-m-6 flex min-h-[calc(100vh-3.5rem)]">
      <InventorySidebar userRole={userRole} />
      <div className="flex-1 min-w-0 p-4 md:p-6">
        {multiDeptEnabled && departments.length > 0 && (
          <div className="mb-3 -mt-1">
            <DeptSwitcher
              departments={departments}
              currentDeptId={null}
              lockedToKind={lockedToKind}
            />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
