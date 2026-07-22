import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inr } from "@/lib/utils";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Hash,
  AlertTriangle,
  Cake,
  Heart,
  Award,
  ShieldCheck,
  Receipt,
  TrendingUp,
  CreditCard,
} from "lucide-react";
import { SpendChart } from "./chart";
import { tierFor } from "@/lib/loyalty";
import { getSessionUser } from "@/lib/session";
import { bucketBreakdown, getBalance, history as walletHistory } from "@/lib/cve/wallet";
import { WalletPanel, type WalletHistoryRow } from "./wallet-panel";
import type { WalletBucket } from "@/lib/cve/types";
import { evaluateCustomerOffers } from "@/lib/cve/offers";
import { Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Full customer ledger view — profile + every bill + outstanding dues +
 * favourites (overall / drink / starter) + active memberships + loyalty ledger.
 *
 * Everything renders on one page in scrollable sections so the cashier can
 * scan the whole relationship at a glance.
 */
export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const outlet = await getActiveOutlet();
  const customer = await db.customer.findFirst({
    where: { id, outletId: outlet.id },
    include: {
      orders: {
        include: {
          items: { include: { item: { include: { category: true } } } },
          payments: true,
        },
        orderBy: { createdAt: "desc" },
      },
      loyaltyTxns: { orderBy: { createdAt: "desc" }, take: 50 },
      memberships: { include: { plan: { include: { benefits: true } } }, orderBy: { createdAt: "desc" } },
      walletAccount: { select: { cachedBalance: true } },
    },
  });
  if (!customer) return notFound();

  // ─── Money summary ────────────────────────────────────────────────────────
  const settled = customer.orders.filter((o) => ["PAID", "DELIVERED", "PICKED_UP"].includes(o.status));
  const unsettled = customer.orders.filter((o) => o.status === "PRINTED");
  const totalSpend = settled.reduce((s, o) => s + o.grandTotal, 0);
  const totalOrders = settled.length;
  const aov = totalOrders ? totalSpend / totalOrders : 0;
  const lastVisit = customer.orders[0]?.createdAt;
  // Each unsettled bill's outstanding amount.
  const dues = unsettled
    .map((o) => ({
      id: o.id,
      invoiceNo: o.invoiceNo,
      createdAt: o.createdAt,
      grandTotal: o.grandTotal,
      amountPaid: o.amountPaid,
      due: Math.max(0, o.grandTotal - o.amountPaid),
    }))
    .filter((d) => d.due > 0);
  const totalDue = dues.reduce((s, d) => s + d.due, 0);

  // ─── 6-month spend trend ──────────────────────────────────────────────────
  const months: { label: string; spend: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const spend = settled
      .filter((o) => o.createdAt >= start && o.createdAt <= end)
      .reduce((s, o) => s + o.grandTotal, 0);
    months.push({ label: start.toLocaleDateString("en-IN", { month: "short" }), spend });
  }

  // ─── Favourites (overall + drink + starter — like the POS popup) ─────────
  const bucketKind = (catName: string): "drink" | "starter" | "other" => {
    const n = catName.toLowerCase();
    if (/drink|beverage|juice|tea|coffee|shake|mocktail|cocktail/.test(n)) return "drink";
    if (/starter|appetizer|appetiser|snack/.test(n)) return "starter";
    return "other";
  };
  const tally = new Map<string, { name: string; qty: number; total: number; kind: "drink" | "starter" | "other" }>();
  for (const o of settled) {
    for (const li of o.items) {
      const name = li.item?.name ?? li.name;
      const kind = li.item?.category ? bucketKind(li.item.category.name) : "other";
      const cur = tally.get(name) ?? { name, qty: 0, total: 0, kind };
      cur.qty += li.qty;
      cur.total += li.price * li.qty;
      tally.set(name, cur);
    }
  }
  const ranked = [...tally.values()].sort((a, b) => b.qty - a.qty);
  const topItems = ranked.slice(0, 10);
  const favOverall = ranked[0] ?? null;
  const favDrink = ranked.find((r) => r.kind === "drink") ?? null;
  const favStarter = ranked.find((r) => r.kind === "starter") ?? null;

  // ─── Active vs expired memberships ───────────────────────────────────────
  const nowD = new Date();
  const activeMemberships = customer.memberships.filter((m) => m.active && m.expiresAt > nowD);
  const expiredMemberships = customer.memberships.filter((m) => !m.active || m.expiresAt <= nowD);

  const tags = customer.tags ? customer.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const tier = tierFor(customer.loyaltyPoints, {
    silverAt: outlet.tierSilverAt,
    goldAt: outlet.tierGoldAt,
    silverMult: outlet.tierSilverMult,
    goldMult: outlet.tierGoldMult,
  });

  // ─── Wallet ─────────────────────────────────────────────────────────────
  // Live balance from the ledger; the customer row's cachedBalance is a
  // best-effort denorm we surface for drift diagnostics only.
  const cachedWalletBalance = customer.walletAccount?.cachedBalance ?? 0;
  const [liveWalletBalance, walletBucketBreakdown, walletTxRows, viewer] = await Promise.all([
    getBalance(customer.id),
    bucketBreakdown(customer.id),
    walletHistory(customer.id, 25),
    getSessionUser(),
  ]);
  const walletHistoryRows: WalletHistoryRow[] = walletTxRows.map((r) => ({
    id: r.id,
    type: r.type as "CREDIT" | "DEBIT",
    bucket: r.bucket as WalletBucket,
    amount: r.amount,
    remaining: r.remaining,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt?.toISOString() ?? null,
    remarks: r.remarks,
  }));
  const isManagerPlus = viewer?.role === "OWNER" || viewer?.role === "MANAGER";
  const tierTone: "secondary" | "info" | "warning" = tier === "GOLD" ? "warning" : tier === "SILVER" ? "info" : "secondary";

  // ─── CVE eligibility preview ────────────────────────────────────────────
  // Runs the rule engine with no order snapshot — surfaces campaigns that
  // qualify on customer facts alone (birthday, membership, tags, etc).
  // Bill-dependent campaigns will re-evaluate when the POS actually has
  // items on the ticket.
  const eligibleOffers = await evaluateCustomerOffers(customer.id, outlet.id);

  return (
    <div>
      <PageHeader
        title={customer.name}
        description={`${tier} tier · customer since ${new Date(customer.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/billing?phone=${customer.phone ?? ""}`}>
                <Receipt className="h-4 w-4" />
                New bill
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/customers">
                <ArrowLeft className="h-4 w-4" />
                All customers
              </Link>
            </Button>
          </>
        }
      />

      {/* KPI strip including outstanding dues */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Kpi label="Lifetime spend" value={inr(totalSpend)} tone="good" Icon={TrendingUp} />
        <Kpi label="Orders" value={String(totalOrders)} Icon={Receipt} />
        <Kpi label="Avg order value" value={inr(aov)} />
        <Kpi
          label="Outstanding dues"
          value={inr(totalDue)}
          tone={totalDue > 0 ? "bad" : "good"}
          Icon={CreditCard}
        />
        <Kpi label="Loyalty balance" value={`${customer.loyaltyPoints} pts`} tone="good" Icon={Award} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* ─── Left column: detailed ledger ─────────────────────────────────── */}
        <div className="space-y-4">
          {/* Favourites — at-a-glance crib sheet */}
          {(favOverall || favDrink || favStarter) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Favourites</CardTitle>
                <CardDescription>Most-ordered items across this customer's history</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {favOverall && <FavTile icon="🍽️" label="Most ordered" name={favOverall.name} qty={favOverall.qty} />}
                  {favStarter && <FavTile icon="🥗" label="Favourite starter" name={favStarter.name} qty={favStarter.qty} />}
                  {favDrink && <FavTile icon="🥤" label="Favourite drink" name={favDrink.name} qty={favDrink.qty} />}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Outstanding dues — red banner if any */}
          {dues.length > 0 && (
            <Card className="border-rose-300 bg-rose-50/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-base inline-flex items-center gap-2 text-rose-900">
                  <AlertTriangle className="h-4 w-4" />
                  Outstanding dues · {inr(totalDue)}
                </CardTitle>
                <CardDescription className="text-rose-700">
                  {dues.length} bill{dues.length === 1 ? "" : "s"} awaiting payment.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Due</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dues.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs">
                          <Link href={`/orders/${d.id}`} className="hover:underline">
                            {d.invoiceNo}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {d.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                        </TableCell>
                        <TableCell className="text-right">{inr(d.grandTotal)}</TableCell>
                        <TableCell className="text-right text-emerald-700">{inr(d.amountPaid)}</TableCell>
                        <TableCell className="text-right font-semibold text-rose-700">{inr(d.due)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/settlements?q=${d.invoiceNo}`}>Settle</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Active memberships */}
          {activeMemberships.length > 0 && (
            <Card className="border-emerald-300 bg-emerald-50/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-base inline-flex items-center gap-2 text-emerald-900">
                  <ShieldCheck className="h-4 w-4" />
                  Active memberships
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {activeMemberships.map((m) => (
                  <div key={m.id} className="rounded-md border bg-card p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{m.plan.name}</span>
                      <Badge variant="success" className="text-[10px]">
                        Valid until{" "}
                        {m.expiresAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </Badge>
                    </div>
                    <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
                      {m.plan.benefits.map((b) => (
                        <li key={b.id}>
                          ✓ {b.name} ({b.qtyPerDay}/day across outlets)
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Spend trend */}
          <Card>
            <CardHeader>
              <CardTitle>Spend trend</CardTitle>
              <CardDescription>Last 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <SpendChart data={months} />
            </CardContent>
          </Card>

          {/* Top items */}
          {topItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top items (lifetime)</CardTitle>
                <CardDescription>Ranked by quantity ordered</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Total spend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topItems.map((t) => (
                      <TableRow key={t.name}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {t.kind === "other" ? "main" : t.kind}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{t.qty}</TableCell>
                        <TableCell className="text-right">{inr(t.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Full order ledger — every bill, every status */}
          <Card>
            <CardHeader>
              <CardTitle>Bill ledger</CardTitle>
              <CardDescription>
                {customer.orders.length} bills total · click an invoice to drill in
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {customer.orders.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">No bills yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customer.orders.slice(0, 100).map((o) => {
                      const due = o.grandTotal - o.amountPaid;
                      return (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono text-xs">
                            <Link href={`/orders/${o.id}`} className="hover:underline">
                              {o.invoiceNo}
                            </Link>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(o.createdAt).toLocaleString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell>{o.orderType.replace("_", " ")}</TableCell>
                          <TableCell className="text-muted-foreground">{o.channel}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                o.status === "PAID" || o.status === "DELIVERED"
                                  ? "success"
                                  : o.status === "CANCELLED"
                                    ? "destructive"
                                    : due > 0
                                      ? "warning"
                                      : "secondary"
                              }
                              className="text-[10px]"
                            >
                              {due > 0 && o.status === "PRINTED" ? "DUE" : o.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{o.items.length}</TableCell>
                          <TableCell className="text-right font-medium">{inr(o.grandTotal)}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {inr(o.amountPaid)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Loyalty ledger */}
          {customer.loyaltyTxns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Loyalty ledger</CardTitle>
                <CardDescription>
                  Earn + redeem history · current balance{" "}
                  <strong>{customer.loyaltyPoints} pts</strong>
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="text-right">Delta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customer.loyaltyTxns.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {t.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={t.reason === "EARN" ? "success" : t.reason === "REDEEM" ? "warning" : "secondary"}
                            className="text-[10px]"
                          >
                            {t.reason}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{t.note ?? "—"}</TableCell>
                        <TableCell
                          className={`text-right font-medium ${t.delta > 0 ? "text-emerald-700" : "text-rose-700"}`}
                        >
                          {t.delta > 0 ? "+" : ""}
                          {t.delta} pts
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Expired memberships */}
          {expiredMemberships.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Past memberships</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Expired</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expiredMemberships.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.plan.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.startsAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.expiresAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary" className="text-[10px]">
                            {m.active ? "Expired" : "Cancelled"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ─── Right rail: profile sidebar ─────────────────────────────────── */}
        <div className="space-y-4">
          <WalletPanel
            customerId={customer.id}
            cachedBalance={cachedWalletBalance}
            liveBalance={liveWalletBalance}
            breakdown={walletBucketBreakdown}
            history={walletHistoryRows}
            canCredit={isManagerPlus}
            canRedeem={true}
          />

          {eligibleOffers.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4" />
                  Eligible offers
                </CardTitle>
                <CardDescription>
                  Campaigns that would fire on the customer&apos;s current profile. Bill-dependent
                  rules re-evaluate at the POS with items on the ticket.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {eligibleOffers.map((r) => (
                  <div key={r.campaign.id} className="rounded-md border p-2 text-xs">
                    <div className="font-medium">{r.campaign.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.benefits.map((b) => (
                        <span
                          key={b.benefitDefId}
                          className="rounded-full border bg-muted/40 px-2 py-0.5 text-[10px]"
                          title={b.type}
                        >
                          {b.label}
                          {b.amount > 0 ? ` · ${inr(Math.round(b.amount))}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm p-4 pt-0">
              <div className="flex items-center gap-2">
                <Badge variant={tierTone}>{tier}</Badge>
                {lastVisit && (
                  <span className="text-xs text-muted-foreground">
                    last visit {new Date(lastVisit).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                  </span>
                )}
              </div>

              {customer.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono">{customer.phone}</span>
                </div>
              )}
              {customer.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{customer.email}</span>
                </div>
              )}
              {customer.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span className="text-xs">{customer.address}</span>
                </div>
              )}
              {customer.gstin && (
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs">{customer.gstin}</span>
                </div>
              )}

              {/* Allergies — surfaced prominently */}
              {customer.allergies && (
                <div className="rounded-md border border-amber-300 bg-amber-50/60 p-2.5 text-xs">
                  <div className="inline-flex items-center gap-1.5 text-amber-900 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Allergies
                  </div>
                  <div className="text-amber-800 mt-0.5">{customer.allergies}</div>
                </div>
              )}

              {/* Birthday / anniversary */}
              {(customer.birthday || customer.anniversary) && (
                <div className="space-y-1 pt-2 border-t">
                  {customer.birthday && (
                    <div className="flex items-center gap-2 text-xs">
                      <Cake className="h-3.5 w-3.5 text-pink-600" />
                      <span className="text-muted-foreground">Birthday</span>
                      <span className="font-medium">
                        {new Date(customer.birthday).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </span>
                    </div>
                  )}
                  {customer.anniversary && (
                    <div className="flex items-center gap-2 text-xs">
                      <Heart className="h-3.5 w-3.5 text-rose-600" />
                      <span className="text-muted-foreground">Anniversary</span>
                      <span className="font-medium">
                        {new Date(customer.anniversary).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {tags.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tags</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <Badge key={t} variant="outline">
                      {t}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  Icon,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  Icon?: React.ComponentType<{ className?: string }>;
}) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {label}
        </div>
        <div className={`text-2xl font-semibold mt-0.5 ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function FavTile({ icon, label, name, qty }: { icon: string; label: string; name: string; qty: number }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2 flex items-center gap-2">
      <span className="text-xl">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-medium text-sm truncate">{name}</div>
        <div className="text-[10px] text-muted-foreground">×{qty} lifetime</div>
      </div>
    </div>
  );
}
