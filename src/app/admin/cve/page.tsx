import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Empty } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { inr } from "@/lib/utils";
import { Gift, Megaphone, Wallet, ArrowRight, AlarmClock, Clock, PlayCircle } from "lucide-react";
import { BUCKET_PRIORITY } from "@/lib/cve/types";
import { runExpirySweepAction } from "./actions";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CveHubPage() {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const viewer = await getSessionUser();
  const canRunSweep = viewer?.role === "OWNER";

  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400_000);
  const in30 = new Date(now.getTime() + 30 * 86400_000);

  const [
    benefitTotal,
    benefitActive,
    campaignTotal,
    campaignActive,
    liveBalanceRows,
    expiringIn7Rows,
    expiringIn30Rows,
    campaignRoi,
    recentRedemptions,
    recentTxns,
  ] = await Promise.all([
    db.benefitDef.count({ where: { outletId: outlet.id } }),
    db.benefitDef.count({ where: { outletId: outlet.id, active: true } }),
    db.campaign.count({ where: { outletId: outlet.id } }),
    db.campaign.count({
      where: { outletId: outlet.id, active: true, endsAt: { gt: now } },
    }),
    db.walletTransaction.findMany({
      where: {
        outletId: outlet.id,
        type: "CREDIT",
        remaining: { gt: 0 },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { bucket: true, remaining: true },
    }),
    db.walletTransaction.aggregate({
      where: {
        outletId: outlet.id,
        type: "CREDIT",
        remaining: { gt: 0 },
        expiresAt: { not: null, gt: now, lte: in7 },
      },
      _sum: { remaining: true },
      _count: { _all: true },
    }),
    db.walletTransaction.aggregate({
      where: {
        outletId: outlet.id,
        type: "CREDIT",
        remaining: { gt: 0 },
        expiresAt: { not: null, gt: now, lte: in30 },
      },
      _sum: { remaining: true },
    }),
    db.campaign.findMany({
      where: { outletId: outlet.id },
      include: {
        redemptions: { select: { amount: true, customerId: true } },
        _count: { select: { redemptions: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.redemptionHistory.findMany({
      where: { outletId: outlet.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        customer: { select: { name: true, phone: true, id: true } },
        campaign: { select: { name: true } },
      },
    }),
    db.walletTransaction.findMany({
      where: { outletId: outlet.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        walletAccount: { include: { customer: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  const liveBalance = liveBalanceRows.reduce((s, r) => s + r.remaining, 0);
  const bucketBreakdown = BUCKET_PRIORITY.map((b) => ({
    bucket: b,
    amount: liveBalanceRows
      .filter((r) => r.bucket === b)
      .reduce((s, r) => s + r.remaining, 0),
  }));

  const expiring7 = expiringIn7Rows._sum.remaining ?? 0;
  const expiring7Count = expiringIn7Rows._count._all ?? 0;
  const expiring30 = expiringIn30Rows._sum.remaining ?? 0;

  const roi = campaignRoi
    .map((c) => {
      const total = c.redemptions.reduce((s, r) => s + r.amount, 0);
      const unique = new Set(c.redemptions.map((r) => r.customerId)).size;
      const ended = c.endsAt.getTime() < now.getTime();
      const live = c.active && !ended && c.startsAt.getTime() <= now.getTime();
      return {
        id: c.id,
        name: c.name,
        redemptions: c._count.redemptions,
        rupees: total,
        uniqueCustomers: unique,
        live,
        ended,
        active: c.active,
      };
    })
    .sort((a, b) => b.rupees - a.rupees);

  return (
    <div>
      <PageHeader
        title="Wallet & Offers"
        description="Configuration-driven Customer Value Engine — benefits, campaigns, memberships, wallet."
        actions={
          canRunSweep ? (
            <form action={runExpirySweepAction}>
              <Button variant="ghost" size="sm" type="submit">
                <PlayCircle className="h-4 w-4" />
                Run expiry sweep
              </Button>
            </form>
          ) : null
        }
      />

      <StatGrid cols={4} className="mb-4">
        <StatCard
          label="Wallet liability (live)"
          value={inr(Math.round(liveBalance))}
          subline="from ledger"
          icon={<Wallet className="h-4 w-4" />}
          tone={liveBalance > 0 ? "warn" : "neutral"}
        />
        <StatCard
          label="Expiring in 7 days"
          value={inr(Math.round(expiring7))}
          subline={`${expiring7Count} credit${expiring7Count === 1 ? "" : "s"}`}
          icon={<AlarmClock className="h-4 w-4" />}
          tone={expiring7 > 0 ? "bad" : "neutral"}
        />
        <StatCard
          label="Live campaigns"
          value={campaignActive}
          subline={`${campaignTotal} total`}
          icon={<Megaphone className="h-4 w-4" />}
          tone="info"
        />
        <StatCard
          label="Benefit registry"
          value={benefitActive}
          subline={`${benefitTotal} total`}
          icon={<Gift className="h-4 w-4" />}
        />
      </StatGrid>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
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

        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4" /> Campaigns
            </CardTitle>
            <CardDescription>
              Bundle rules + benefits into a time-bound offer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/cve/campaigns">
                Manage campaigns <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4" /> Memberships
            </CardTitle>
            <CardDescription>
              Existing plan & member management. Attach registry benefits from the registry page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" variant="outline">
              <Link href="/memberships">
                Open memberships <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Wallet liability by bucket ────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Wallet liability by bucket</CardTitle>
            <CardDescription>
              Live totals of unspent, unexpired credit. Expiring balance leaves first at redemption.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {bucketBreakdown.filter((b) => b.amount > 0).length === 0 ? (
                <div className="text-xs text-muted-foreground">No live credit at this outlet.</div>
              ) : (
                bucketBreakdown
                  .filter((b) => b.amount > 0)
                  .map((b) => {
                    const pct = liveBalance === 0 ? 0 : (b.amount / liveBalance) * 100;
                    return (
                      <div key={b.bucket} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono text-muted-foreground">{b.bucket}</span>
                          <span className="tabular-nums font-medium">
                            {inr(Math.round(b.amount))}
                            <span className="text-muted-foreground ml-1">
                              ({pct.toFixed(0)}%)
                            </span>
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
            {expiring30 > 0 ? (
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50/50 p-2 text-xs text-amber-900 inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {inr(Math.round(expiring30))} expires within 30 days
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Campaign ROI ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Campaign ROI</CardTitle>
            <CardDescription>
              Redemptions and rupee value delivered per campaign — top {roi.length}.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {roi.length === 0 ? (
              <Empty title="No campaigns yet" desc="Create one in the campaign builder to start seeing ROI." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right">Redemptions</TableHead>
                    <TableHead className="text-right">Customers</TableHead>
                    <TableHead className="text-right">Rupees delivered</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roi.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/admin/cve/campaigns/${r.id}`} className="font-medium hover:underline">
                          {r.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.redemptions}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.uniqueCustomers}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {inr(Math.round(r.rupees))}
                      </TableCell>
                      <TableCell>
                        {!r.active ? (
                          <Badge variant="secondary" className="text-[10px]">Off</Badge>
                        ) : r.ended ? (
                          <Badge variant="destructive" className="text-[10px]">Ended</Badge>
                        ) : r.live ? (
                          <Badge variant="success" className="text-[10px]">Live</Badge>
                        ) : (
                          <Badge variant="info" className="text-[10px]">Scheduled</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent redemptions ──────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent redemptions</CardTitle>
            <CardDescription>
              Offer-level ledger — every campaign/membership benefit fired.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {recentRedemptions.length === 0 ? (
              <Empty title="No redemptions yet" desc="Once campaigns fire at the POS they'll land here." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Benefit</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentRedemptions.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.createdAt.toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/customers/${r.customer.id}`}
                          className="text-sm hover:underline"
                        >
                          {r.customer.name}
                        </Link>
                        {r.customer.phone ? (
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {r.customer.phone}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs">{r.campaign?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.benefitLabel}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs font-medium">
                        {inr(Math.round(r.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent wallet activity ──────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent wallet activity</CardTitle>
            <CardDescription>Wallet ledger — the money side of the offer.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {recentTxns.length === 0 ? (
              <Empty title="No wallet activity yet" desc="Credit and debit rows show up here as they land." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Bucket</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTxns.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {t.createdAt.toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/customers/${t.walletAccount.customer.id}`}
                          className="text-sm hover:underline"
                        >
                          {t.walletAccount.customer.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs">{t.source}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {t.bucket}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs font-medium">
                        <span className={t.type === "CREDIT" ? "text-emerald-700" : "text-rose-700"}>
                          {t.type === "CREDIT" ? "+" : "−"}
                          {inr(Math.round(t.amount))}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
