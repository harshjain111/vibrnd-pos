import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { FilterBar } from "@/components/ui/filter-bar";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { inr } from "@/lib/utils";
import { Wallet, AlarmClock, ArrowRight, Phone, HelpCircle } from "lucide-react";
import { BUCKET_PRIORITY, type WalletBucket } from "@/lib/cve/types";
import { TopupDialog } from "./topup-dialog";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "ALL", label: "All wallets" },
  { key: "WITH_BALANCE", label: "With balance" },
  { key: "EXPIRING", label: "Expiring ≤ 7 days" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function WalletsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: TabKey; sort?: "balance" | "recent" }>;
}) {
  await requireUser("BILLER");
  const outlet = await getActiveOutlet();
  const sp = await searchParams;
  const search = (sp.q ?? "").trim();
  const tab: TabKey = (sp.tab as TabKey) ?? "ALL";
  const sort = sp.sort ?? "balance";

  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400_000);

  // Wallet accounts scoped to this outlet, with the customer surface data
  // + a slice of live credits so we can compute derived balance + bucket
  // breakdown without a second round-trip per row.
  const accounts = await db.walletAccount.findMany({
    where: {
      outletId: outlet.id,
      ...(search
        ? {
            customer: {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { phone: { contains: search } },
              ],
            },
          }
        : {}),
    },
    include: {
      customer: { select: { id: true, name: true, phone: true, tags: true } },
      transactions: {
        where: {
          type: "CREDIT",
          remaining: { gt: 0 },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: {
          bucket: true,
          remaining: true,
          expiresAt: true,
          createdAt: true,
        },
      },
    },
    orderBy:
      sort === "recent"
        ? { updatedAt: "desc" }
        : { cachedBalance: "desc" },
    take: 250,
  });

  type Row = {
    id: string;
    customerId: string;
    customerName: string;
    customerPhone: string | null;
    cachedBalance: number;
    liveBalance: number;
    breakdown: Record<WalletBucket, number>;
    expiringSoon: number;
    lastActivity: Date | null;
  };
  const rows: Row[] = accounts.map((a) => {
    const breakdown: Record<WalletBucket, number> = Object.fromEntries(
      BUCKET_PRIORITY.map((b) => [b, 0] as const),
    ) as Record<WalletBucket, number>;
    let live = 0;
    let expSoon = 0;
    let lastActivity: Date | null = a.updatedAt;
    for (const t of a.transactions) {
      const b = (t.bucket as WalletBucket) ?? "MANUAL";
      if (b in breakdown) breakdown[b] += t.remaining;
      live += t.remaining;
      if (t.expiresAt && t.expiresAt.getTime() <= in7.getTime()) {
        expSoon += t.remaining;
      }
      if (!lastActivity || t.createdAt > lastActivity) lastActivity = t.createdAt;
    }
    return {
      id: a.id,
      customerId: a.customer.id,
      customerName: a.customer.name,
      customerPhone: a.customer.phone,
      cachedBalance: a.cachedBalance,
      liveBalance: round2(live),
      breakdown,
      expiringSoon: round2(expSoon),
      lastActivity,
    };
  });

  const filtered = rows.filter((r) => {
    if (tab === "WITH_BALANCE") return r.liveBalance > 0;
    if (tab === "EXPIRING") return r.expiringSoon > 0;
    return true;
  });

  const totalLiability = rows.reduce((s, r) => s + r.liveBalance, 0);
  const totalExpiring = rows.reduce((s, r) => s + r.expiringSoon, 0);
  const walletsWithBalance = rows.filter((r) => r.liveBalance > 0).length;

  const counts: Record<TabKey, number> = {
    ALL: rows.length,
    WITH_BALANCE: walletsWithBalance,
    EXPIRING: rows.filter((r) => r.expiringSoon > 0).length,
  };

  return (
    <div>
      <PageHeader
        title="Virtual wallets"
        description="Every customer's ledger-backed wallet at this outlet. Click a row for the full transaction history."
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/wallets/guide">
                <HelpCircle className="h-4 w-4" />
                Help & guide
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/cve">
                Wallet & Offers <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </>
        }
      />

      <StatGrid cols={3} className="mb-4">
        <StatCard
          label="Total liability"
          value={inr(Math.round(totalLiability))}
          subline={`${walletsWithBalance} wallet${walletsWithBalance === 1 ? "" : "s"} with balance`}
          icon={<Wallet className="h-4 w-4" />}
          tone={totalLiability > 0 ? "warn" : "neutral"}
        />
        <StatCard
          label="Expiring in 7 days"
          value={inr(Math.round(totalExpiring))}
          subline="wallet-wide"
          icon={<AlarmClock className="h-4 w-4" />}
          tone={totalExpiring > 0 ? "bad" : "neutral"}
        />
        <StatCard
          label="Accounts"
          value={rows.length}
          subline="lazily created on first credit"
        />
      </StatGrid>

      <FilterTabs
        className="mb-3"
        basePath="/wallets"
        current={tab}
        defaultKey="ALL"
        items={TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key] }))}
      />

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <FilterBar
            action="/wallets"
            searchName="q"
            searchPlaceholder="Search by name or phone…"
            searchDefault={search}
            showClear={!!search}
          >
            {tab !== "ALL" ? <input type="hidden" name="tab" value={tab} /> : null}
            {sort !== "balance" ? <input type="hidden" name="sort" value={sort} /> : null}
          </FilterBar>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Sort:</span>
          <Link
            href={{ pathname: "/wallets", query: { ...(sp.q ? { q: sp.q } : {}), ...(sp.tab ? { tab: sp.tab } : {}), sort: "balance" } }}
            className={`rounded-md border px-2 py-0.5 ${sort === "balance" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
          >
            Balance
          </Link>
          <Link
            href={{ pathname: "/wallets", query: { ...(sp.q ? { q: sp.q } : {}), ...(sp.tab ? { tab: sp.tab } : {}), sort: "recent" } }}
            className={`rounded-md border px-2 py-0.5 ${sort === "recent" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
          >
            Recent activity
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <Empty
              title={
                search
                  ? "No wallets match your search"
                  : tab === "WITH_BALANCE"
                    ? "No wallets have a balance yet"
                    : tab === "EXPIRING"
                      ? "Nothing expiring soon"
                      : "No wallets yet"
              }
              desc={
                tab === "ALL"
                  ? "Wallets are created lazily when a customer earns cashback, receives a campaign credit, or gets a manual top-up."
                  : "Try switching to All wallets."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead>Bucket breakdown</TableHead>
                  <TableHead className="text-right">Expiring ≤ 7d</TableHead>
                  <TableHead>Last activity</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const activeBuckets = BUCKET_PRIORITY.filter((b) => r.breakdown[b] > 0);
                  const drift = Math.abs(r.cachedBalance - r.liveBalance) > 0.01;
                  return (
                    <TableRow key={r.id} className="hover:bg-accent/30">
                      <TableCell>
                        <Link
                          href={`/customers/${r.customerId}`}
                          className="font-medium hover:underline"
                        >
                          {r.customerName}
                        </Link>
                        {r.customerPhone ? (
                          <div className="text-[10px] text-muted-foreground font-mono inline-flex items-center gap-1 mt-0.5">
                            <Phone className="h-2.5 w-2.5" />
                            {r.customerPhone}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-semibold tabular-nums">
                          {inr(Math.round(r.liveBalance))}
                        </div>
                        {drift ? (
                          <div className="text-[9px] text-amber-700">
                            cache drifted
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {activeBuckets.length === 0 ? (
                          <span className="text-[11px] text-muted-foreground">Empty</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {activeBuckets.map((b) => (
                              <span
                                key={b}
                                className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-1.5 py-0.5 text-[10px]"
                                title={`${b}: ${inr(r.breakdown[b])}`}
                              >
                                <span className="font-mono text-muted-foreground">{b}</span>
                                <span className="tabular-nums font-medium">
                                  {inr(Math.round(r.breakdown[b]))}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.expiringSoon > 0 ? (
                          <Badge variant="warning" className="text-[10px]">
                            {inr(Math.round(r.expiringSoon))}
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.lastActivity
                          ? r.lastActivity.toLocaleString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <TopupDialog
                            customerId={r.customerId}
                            customerLabel={r.customerName}
                            variant="ghost"
                          />
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/customers/${r.customerId}`}>Open</Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground mt-3">
        Balances are computed live from the wallet ledger (unspent, unexpired credit only).
        The <span className="font-mono">cachedBalance</span> denorm is only surfaced when it
        drifts from ledger truth — this is a diagnostic signal, not a source of truth.
      </div>
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
