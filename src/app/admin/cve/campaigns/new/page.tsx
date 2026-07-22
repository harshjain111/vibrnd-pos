import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { CampaignForm } from "../campaign-form";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();

  const [benefits, outlets, plans] = await Promise.all([
    db.benefitDef.findMany({
      where: { outletId: outlet.id },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, type: true, active: true },
    }),
    db.outlet.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.membershipPlan.findMany({
      where: { outletId: outlet.id, active: true },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="New campaign"
        description="Configure rules and pick benefits from the registry."
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/cve/campaigns">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
        }
      />
      <CampaignForm benefits={benefits} outlets={outlets} plans={plans} />
    </div>
  );
}
