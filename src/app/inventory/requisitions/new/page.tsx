import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser, ownedDepartmentKind } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { rmDepartmentFilter } from "@/lib/department-scope";
import { NewRequisitionForm } from "./client";

export const dynamic = "force-dynamic";

export default async function NewRequisitionPage() {
  await requireUser();
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();

  const hodKind = user ? ownedDepartmentKind(user.role) : null;
  const depts = await db.department.findMany({
    where: { outletId: outlet.id, active: true, kind: { not: "STORE" } },
    orderBy: { kind: "asc" },
  });
  const defaultDept = hodKind ? depts.find((d) => d.kind === hodKind) : depts[0];

  // HOD scope — only show items their dept is allowed to request. The
  // matching field on RawMaterial is allowedDepartments (CSV); the helper
  // wraps that into a Prisma where fragment. Non-HOD roles see everything.
  const deptScope = rmDepartmentFilter(user?.role ?? null);
  const rms = await db.rawMaterial.findMany({
    where: { outletId: outlet.id, active: true, ...(deptScope ?? {}) },
    select: { id: true, name: true, unit: true, currentQty: true, parLevel: true },
    orderBy: { name: "asc" },
  });

  // Chain sources — surface BS / BK only when this outlet has them linked
  // AND the user isn't a HOD (HODs only do internal requisitions to their
  // own outlet's store).
  const bsId = (outlet as any).baseStoreOutletId as string | null;
  const bkId = (outlet as any).baseKitchenOutletId as string | null;
  const chainSources: { id: string; name: string; kindBadge: string }[] = [];
  if (!hodKind) {
    if (bsId) {
      const bs = await db.outlet.findUnique({ where: { id: bsId }, select: { id: true, name: true } });
      if (bs) chainSources.push({ id: bs.id, name: bs.name, kindBadge: "BS" });
    }
    if (bkId) {
      const bk = await db.outlet.findUnique({ where: { id: bkId }, select: { id: true, name: true } });
      if (bk) chainSources.push({ id: bk.id, name: bk.name, kindBadge: "BK" });
    }
  }

  return (
    <div>
      <PageHeader
        title="New requisition"
        description={
          chainSources.length > 0
            ? "Request stock from your own store, Base Store, or Base Kitchen"
            : "Request raw materials from the outlet's store"
        }
      />
      <Card className="mb-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">How this works</CardTitle>
          <CardDescription>
            Pick the items + qty you need. Internal requisitions go to your outlet's Store
            Manager. Chain requisitions go to the Base Store / Base Kitchen's Store Manager —
            on approve, a chain-transfer is shipped to your store and you confirm receipt
            from /inventory/transfers.
          </CardDescription>
        </CardHeader>
      </Card>
      {/* If the HOD's allowedDepartments filter excludes every item, the
          item picker would render blank and the form looks broken. Surface
          the cause directly so the owner knows what to fix. */}
      {hodKind && rms.length === 0 ? (
        <Card className="border-amber-300 bg-amber-50/40">
          <CardHeader>
            <CardTitle className="text-base text-amber-900">No items tagged for your department yet</CardTitle>
            <CardDescription className="text-amber-800">
              The {hodKind.toLowerCase()} HOD only sees raw materials whose <strong>Available to departments</strong>
              setting includes {hodKind}. The owner needs to open each item in <strong>Inventory → Raw materials</strong> and
              tick {hodKind} (or leave the field empty so the item is shared).
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4">
            <NewRequisitionForm
              departments={depts.map((d) => ({ id: d.id, name: d.name, kind: d.kind }))}
              defaultDepartmentId={defaultDept?.id ?? null}
              lockDepartment={!!hodKind}
              chainSources={chainSources}
              rawMaterials={rms.map((r) => ({
                id: r.id,
                name: r.name,
                unit: r.unit,
                currentQty: r.currentQty,
                parLevel: r.parLevel,
              }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
