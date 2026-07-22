import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { CampaignForm, type CampaignInitial } from "../campaign-form";
import { deleteCampaign } from "../actions";
import type { ConditionType } from "@/lib/cve/types";

export const dynamic = "force-dynamic";

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const { id } = await params;

  const [campaign, benefits, outlets, plans] = await Promise.all([
    db.campaign.findFirst({
      where: { id, outletId: outlet.id },
      include: {
        rules: { orderBy: { order: "asc" } },
        benefits: { orderBy: { order: "asc" } },
      },
    }),
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
  if (!campaign) return notFound();

  const initial: CampaignInitial = {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description ?? "",
    active: campaign.active,
    startsAt: toLocalInput(campaign.startsAt),
    endsAt: toLocalInput(campaign.endsAt),
    priority: campaign.priority,
    maxRedemptions: campaign.maxRedemptions ?? "",
    maxPerCustomer: campaign.maxPerCustomer ?? "",
    rules: campaign.rules.map((r) => ({
      conditionType: r.conditionType as ConditionType,
      configJson: r.configJson,
      groupOp: (r.groupOp as "AND" | "OR") ?? "AND",
    })),
    benefits: campaign.benefits.map((b) => ({
      benefitDefId: b.benefitDefId,
      overrideJson: b.overrideJson ?? undefined,
    })),
  };

  return (
    <div>
      <PageHeader
        title={campaign.name}
        description="Edit campaign — rules re-evaluate at the next bill."
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/cve/campaigns">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <form action={deleteCampaign}>
              <input type="hidden" name="id" value={campaign.id} />
              <Button variant="ghost" size="sm" type="submit" className="text-rose-700">
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </form>
          </>
        }
      />
      <CampaignForm initial={initial} benefits={benefits} outlets={outlets} plans={plans} />
    </div>
  );
}

function toLocalInput(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}
