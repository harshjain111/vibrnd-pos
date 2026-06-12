import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser, ownedDepartmentKind } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
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

  const rms = await db.rawMaterial.findMany({
    where: { outletId: outlet.id, active: true },
    select: { id: true, name: true, unit: true, currentQty: true, parLevel: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="New requisition"
        description="Request raw materials from the outlet's store"
      />
      <Card className="mb-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">How this works</CardTitle>
          <CardDescription>
            Pick the items + qty you need. On submit it goes to the Store Manager — they can
            approve in full, partial-approve (with a reason per line), or decline. Once approved
            you'll get a notification with what's been transferred.
          </CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardContent className="p-4">
          <NewRequisitionForm
            departments={depts.map((d) => ({ id: d.id, name: d.name, kind: d.kind }))}
            defaultDepartmentId={defaultDept?.id ?? null}
            lockDepartment={!!hodKind}
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
    </div>
  );
}
