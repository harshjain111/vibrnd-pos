import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { inr } from "@/lib/utils";
import { Gift, Megaphone, Wallet, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CveHubPage() {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();

  const [benefitCount, activeBenefitCount, campaignCount, activeCampaignCount, walletTotal] = await Promise.all([
    db.benefitDef.count({ where: { outletId: outlet.id } }),
    db.benefitDef.count({ where: { outletId: outlet.id, active: true } }),
    db.campaign.count({ where: { outletId: outlet.id } }),
    db.campaign.count({
      where: { outletId: outlet.id, active: true, endsAt: { gt: new Date() } },
    }),
    db.walletAccount.aggregate({
      _sum: { cachedBalance: true },
      where: { outletId: outlet.id },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Wallet & Offers"
        description="Configuration-driven Customer Value Engine — benefits, campaigns, memberships, wallet."
      />

      <StatGrid cols={3} className="mb-4">
        <StatCard
          label="Benefit registry"
          value={activeBenefitCount}
          subline={`${benefitCount} total`}
          icon={<Gift className="h-4 w-4" />}
        />
        <StatCard
          label="Live campaigns"
          value={activeCampaignCount}
          subline={`${campaignCount} total`}
          icon={<Megaphone className="h-4 w-4" />}
          tone="info"
        />
        <StatCard
          label="Wallet liability"
          value={inr(Math.round(walletTotal._sum.cachedBalance ?? 0))}
          subline="denorm — Phase 8 dashboard shows the ledger truth"
          icon={<Wallet className="h-4 w-4" />}
          tone="warn"
        />
      </StatGrid>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gift className="h-4 w-4" /> Benefit registry
            </CardTitle>
            <CardDescription>
              The reusable list of THEN-actions campaigns and memberships attach to.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/cve/benefits">
                Manage benefits <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="opacity-70">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4" /> Campaigns
              <Badge variant="secondary" className="text-[10px]">Phase 6</Badge>
            </CardTitle>
            <CardDescription>
              Bundle rules + benefits into a time-bound offer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" variant="outline" disabled>
              Coming next
            </Button>
          </CardContent>
        </Card>

        <Card className="opacity-70">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4" /> Wallet dashboard
              <Badge variant="secondary" className="text-[10px]">Phase 8</Badge>
            </CardTitle>
            <CardDescription>
              Live liability, expiring credits, campaign ROI.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" variant="outline" disabled>
              Coming later
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 text-xs text-muted-foreground">
        Memberships live at{" "}
        <Link href="/memberships" className="text-primary underline-offset-2 hover:underline">
          /memberships
        </Link>
        . Attach benefit definitions from the registry to a plan on that page.
      </div>
    </div>
  );
}
