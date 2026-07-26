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
import { Gift, Megaphone, Wallet, ArrowRight, AlarmClock, Clock, PlayCircle, HelpCircle } from "lucide-react";
import {
  BUCKET_PRIORITY,
  SOURCE_KIND_META,
  normalizeBucket,
  normalizeSourceKind,
  type SourceKind,
  type WalletBucket,
} from "@/lib/cve/types";
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
  const last30 = new Date(now.getTime() - 30 * 86400_000);

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
    sourceFlowRows,
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
    // v2 — sourceKind flow: credits over last 30 days grouped by
    // where the money came from. Answers "how much cashback did we
    // hand out this month?" without pinning the answer to buckets.
    db.walletTransaction.findMany({
      where: {
        outletId: outlet.id,
        type: "CREDIT",
        createdAt: { gte: last30 },
      },
      select: { sourceKind: true, bucket: true, amount: true },
    }),
  ]);

  const liveBalance = liveBalanceRows.reduce((s, r) => s + r.remaining, 0);
  // v2 — normalise every row's bucket string so legacy values (before
  // the backfill lands) still contribute to the right column.
  const bucketTotals = new Map<WalletBucket, number>(BUCKET_PRIORITY.map((b) => [b, 0]));
  for (const r of liveBalanceRows) {
    const b = normalizeBucket(r.bucket);
    bucketTotals.set(b, (bucketTotals.get(b) ?? 0) + r.remaining);
  }
  // (v1 bucket-granular breakdown removed — the KPI strip surfaces
  // Cash + Promo liability separately, and the sourceKind flow panel
  // below answers "where did the money come from?" more clearly.)

  const expiring7 = expiringIn7Rows._sum.remaining ?? 0;
  const expiring7Count = expiringIn7Rows._count._all ?? 0;
  const expiring30 = expiringIn30Rows._sum.remaining ?? 0;

  // Group credits by sourceKind for the "Where did the money come from"
  // panel. Legacy rows without a sourceKind (pre-R2 backfill) get
  // normalised via normalizeSourceKind so they still contribute.
  const sourceFlow = new Map<SourceKind, number>();
  let sourceFlowTotal = 0;
  for (const r of sourceFlowRows) {
    const sk = normalizeSourceKind(r.sourceKind);
    sourceFlow.set(sk, (sourceFlow.get(sk) ?? 0) + r.amount);
    sourceFlowTotal += r.amount;
  }
  const sourceFlowSorted = Array.from(sourceFlow.entries())
    .sort((a, b) => b[1] - a[1])
    .filter(([, amt]) => amt > 0);

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
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/wallets/guide">
                <HelpCircle className="h-4 w-4" />
                Help & guide
              </Link>
            </Button>
            {canRunSweep ? (
              <form action={runExpirySweepAction}>
                <Button variant="ghost" size="sm" type="submit">
                  <PlayCircle className="h-4 w-4" />
                  Run expiry sweep
                </Button>
              </form>
            ) : null}
          </>
        }
      />

      <StatGrid cols={4} className="mb-4">
        <StatCard
          label="Cash Wallet liability"
          value={inr(Math.round(bucketTotals.get("CASH") ?? 0))}
          subline="fully redeemable"
          icon={<Wallet className="h-4 w-4" />}
          tone={(bucketTotals.get("CASH") ?? 0) > 0 ? "warn" : "neutral"}
        />
        <StatCard
          label="Promotional liability"
          value={inr(Math.round(bucketTotals.get("PROMO") ?? 0))}
          subline="caps + expiry apply"
          icon={<Wallet className="h-4 w-4" />}
          tone={(bucketTotals.get("PROMO") ?? 0) > 0 ? "info" : "neutral"}
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
          subline={`${campaignTotal} total · ${benefitActive} active benefits`}
          icon={<Megaphone className="h-4 w-4" />}
          tone="info"
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
        {/* Where the money came from — sourceKind flow (last 30d) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Where credit came from (30 days)</CardTitle>
            <CardDescription>
              Every wallet credit written in the last 30 days, grouped by origin. Replaces the
              bucket-granular breakdown from v1 — sourceKind is a reporting label, not a
              wallet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sourceFlowSorted.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  No credits landed in the last 30 days.
                </div>
              ) : (
                sourceFlowSorted.map(([sk, amt]) => {
                  const pct = sourceFlowTotal === 0 ? 0 : (amt / sourceFlowTotal) * 100;
                  const meta = SOURCE_KIND_META[sk];
                  return (
                    <div key={sk} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span title={meta.hint}>{meta.label}</span>
                        <span className="tabular-nums font-medium">
                          {inr(Math.round(amt))}
                          <span className="text-muted-foreground ml-1">
                            ({pct.toFixed(0)}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {expiring30 > 0 ? (
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50/50 p-2 text-xs text-amber-900 inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {inr(Math.round(expiring30))} expires within 30 days (Promotional Balance)
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
