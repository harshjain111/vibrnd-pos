import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { AuditForm } from "./client";

export const dynamic = "force-dynamic";

export default async function NewAuditPage() {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const assets = await db.fixedAsset.findMany({
    where: { outletId: outlet.id, active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return (
    <div>
      <PageHeader
        title="New audit"
        description="Walk the floor, count what you see. Variance pings a notification + bumps the register so the next audit starts fresh."
      />
      <Card className="mb-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">How this works</CardTitle>
          <CardDescription>
            Each row shows the <strong>expected</strong> qty from the register and a "Found" input you fill in.
            Anything that doesn't match gets flagged at the bottom. Submit to lock the audit + update the
            register.
          </CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardContent className="p-4">
          <AuditForm
            assets={assets.map((a) => ({
              id: a.id,
              name: a.name,
              category: a.category,
              location: a.location ?? "",
              qty: a.qty,
              condition: a.condition,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
