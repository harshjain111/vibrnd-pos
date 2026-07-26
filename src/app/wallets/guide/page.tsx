import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/rbac";
import {
  ArrowLeft,
  ArrowRight,
  Wallet,
  Sparkles,
  Users,
  ShieldCheck,
  Clock,
  Info,
} from "lucide-react";
import {
  BUCKET_META,
  DESTINATION_META,
  SOURCE_KIND_META,
  TRIGGER_META,
} from "@/lib/cve/types";

export const dynamic = "force-dynamic";

export default async function WalletGuidePage() {
  await requireUser();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Wallet & Offers — plain-English guide"
        description="What everything is, how the pieces fit together, and how to run the common flows."
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/wallets">
              <ArrowLeft className="h-4 w-4" />
              Back to wallets
            </Link>
          </Button>
        }
      />

      {/* ── Core idea ───────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            The core idea (30 seconds)
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            A <b>wallet</b> is a virtual balance every customer has. It goes up when they top
            up (paid you real money), earn cashback, get a campaign bonus, get a membership
            credit, or get a manual adjustment. It goes down when they redeem against a bill.
          </p>
          <p>
            Every credit and every debit is a row in a <b>ledger</b>. Nothing is ever silently
            overwritten. The customer&apos;s balance is <i>computed</i> from that ledger — never
            trusted from a cached number.
          </p>
          <p>
            Redemption at billing is <b>OTP-verified</b>. Customer gets a 6-digit code on
            SMS, reads it out, cashier types it in. Wallet debits only after the OTP checks
            out.
          </p>
        </CardContent>
      </Card>

      {/* ── Two buckets ─────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            The wallet has two buckets — and only two
          </CardTitle>
          <CardDescription>
            Everything else you might see on a transaction (Cashback / Recharge / Referral …)
            is just a <i>source label</i>, not a separate wallet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="border rounded-md divide-y">
            <div className="p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-[10px]">CASH</Badge>
                  <span className="font-semibold text-sm">{BUCKET_META.CASH.label}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {BUCKET_META.CASH.hint} <b>No caps, no restrictions.</b> Whatever&apos;s in
                  here is spent freely.
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  Fed by: recharges, recharge bonuses, cashback, referral rewards, refunds,
                  loyalty conversions, manual admin credits.
                </div>
              </div>
            </div>
            <div className="p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-[10px]">PROMO</Badge>
                  <span className="font-semibold text-sm">{BUCKET_META.PROMO.label}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {BUCKET_META.PROMO.hint} Common caps: max % of bill, min bill, expiry,
                  outlet / product / category restrictions.
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  Fed by: welcome credits, first-visit bonuses, festival offers, any campaign
                  targeting Promotional Wallet destination.
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Redemption order ─────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            How redemption works at billing
          </CardTitle>
          <CardDescription>
            When a customer redeems ₹X, this is the order money leaves the wallet.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <ol className="list-decimal ml-5 space-y-1">
            <li><b>Membership benefits</b> — daily free tea, exclusive items etc.</li>
            <li><b>Promotional Wallet</b> — restricted credit burns first (soonest expiry
              wins). Each credit respects its own caps.</li>
            <li><b>Cash Wallet</b> — the customer&apos;s "real money" wallet, drained last.</li>
            <li><b>Coupons</b> — a single coupon can be applied per bill.</li>
            <li><b>Manual discounts</b> — cashier / manager override, mandatory reason
              captured, audit-logged.</li>
          </ol>
          <div className="rounded-md border bg-muted/40 p-3 text-xs mt-3">
            <div className="font-semibold mb-1">Example — a ₹2000 bill</div>
            <div className="font-mono text-[11px] whitespace-pre">
{`Bill                           ₹2000
Membership (free tea)         − ₹200 → ₹1800
Promotional Wallet (20% cap)  − ₹360 → ₹1440    (₹240 stays)
Cash Wallet                   − ₹500 → ₹940
Remaining payable              ₹940`}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Scenario: pay ₹1000, get ₹1200 ──────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Scenario: "Pay ₹1000, get ₹1200 in wallet"
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <ol className="list-decimal ml-5 space-y-1">
            <li>
              Cashier opens the customer on{" "}
              <Link href="/wallets" className="text-primary underline underline-offset-2">
                /wallets
              </Link>{" "}
              (or from the billing screen customer chip).
            </li>
            <li>Clicks <b>Top up wallet</b>.</li>
            <li>
              Enters <b>Amount paid ₹1000</b>, <b>Bonus ₹200</b>, <b>Payment mode UPI</b>.
              Confirms.
            </li>
          </ol>
          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <div className="font-semibold mb-1">What lands on the ledger</div>
            <div className="font-mono text-[11px] whitespace-pre">
{`+ ₹1000  bucket=CASH  sourceKind=RECHARGE       (never expires)
+ ₹200   bucket=CASH  sourceKind=RECHARGE_BONUS  (expires in 30d)

Cash Wallet:          ₹1200 available
Promotional Balance:  ₹0`}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Both parts land in Cash Wallet — the bonus behaves exactly like ordinary
            balance. If admin has a <i>WALLET_RECHARGE</i>-triggered campaign
            configured, that campaign also fires automatically and stacks its bonus on
            top.
          </p>
        </CardContent>
      </Card>

      {/* ── Rules & Memberships & Campaigns ─────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Rules · Memberships · Campaigns
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <div>
            <div className="font-semibold">What&apos;s a rule?</div>
            <p className="text-xs text-muted-foreground">
              A rule is one line of an <b>IF</b> condition. Rules combine with AND / OR to
              build things like: "Gold member <b>AND</b> Wednesday <b>AND</b> bill ≥ ₹1000".
              Vocabulary: customer tag, membership, outlet, date/time, bill amount, visit
              count, gender, birthday, anniversary, category / product purchased, payment
              method, first visit, custom field.
            </p>
          </div>
          <div>
            <div className="font-semibold">What&apos;s a membership?</div>
            <p className="text-xs text-muted-foreground">
              A paid plan the customer buys (e.g. "Tea Club — ₹1000/year, one free tea per
              day"). A plan carries <b>benefits</b>: item + qty/day (legacy), or any
              BenefitDef from the registry (wallet credit, % off, free delivery, etc). Manage
              at{" "}
              <Link href="/memberships" className="text-primary underline">/memberships</Link>.
            </p>
          </div>
          <div>
            <div className="font-semibold">What&apos;s a campaign?</div>
            <p className="text-xs text-muted-foreground">
              A time-bound offer built from four things: <b>Trigger</b> (what fires it) →
              <b> Eligibility</b> (which customers qualify) → <b>Benefit</b> (what value they
              get) → <b>Destination</b> (where the value lands). Manage at{" "}
              <Link href="/admin/cve/campaigns" className="text-primary underline">
                /admin/cve/campaigns
              </Link>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Trigger + Destination reference ─────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Trigger + Destination — the two dropdowns</CardTitle>
          <CardDescription>
            Every campaign picks one Trigger and one Destination. These are the two decisions
            that shape a campaign&apos;s identity.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Triggers
            </div>
            <div className="border rounded-md divide-y">
              {Object.entries(TRIGGER_META).map(([k, m]) => (
                <div key={k} className="p-2">
                  <div className="font-medium">{m.label}</div>
                  <div className="text-[10px] text-muted-foreground">{m.hint}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Destinations
            </div>
            <div className="border rounded-md divide-y">
              {Object.entries(DESTINATION_META).map(([k, m]) => (
                <div key={k} className="p-2">
                  <div className="font-medium">{m.label}</div>
                  <div className="text-[10px] text-muted-foreground">{m.hint}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Caps ────────────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Where do caps live?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <ul className="list-disc ml-5 space-y-1 text-xs">
            <li>
              <b>Per-benefit cap</b> — set inside the BenefitDef ("10% cashback, capped at
              ₹100 per bill"). Manage at{" "}
              <Link href="/admin/cve/benefits" className="text-primary underline">
                /admin/cve/benefits
              </Link>.
            </li>
            <li>
              <b>Per-customer redemption cap</b> — set on the Campaign ("Max 3 redemptions
              per customer").
            </li>
            <li>
              <b>Total redemption cap</b> — set on the Campaign ("Max 1000 redemptions
              across all customers").
            </li>
            <li>
              <b>Wallet balance cap</b> — none by default; PROMO credits carry their own
              per-credit restrictions.
            </li>
            <li>
              <b>OTP</b> — 3 attempts, 5-minute TTL. Hard-coded, can&apos;t be bypassed.
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* ── sourceKind reference ─────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" />
            Source labels on transaction rows
          </CardTitle>
          <CardDescription>
            Every wallet transaction carries a sourceKind so the ledger tells you exactly
            where the money came from. Reporting only — doesn&apos;t affect redemption.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md divide-y text-xs">
            {Object.entries(SOURCE_KIND_META).map(([k, m]) => (
              <div key={k} className="p-2 flex items-start gap-3">
                <Badge variant="outline" className="font-mono text-[9px] min-w-[110px] justify-center">
                  {k}
                </Badge>
                <div>
                  <div className="font-medium">{m.label}</div>
                  <div className="text-[10px] text-muted-foreground">{m.hint}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Security ────────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Security guarantees
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <ul className="list-disc ml-5 space-y-1 text-xs">
            <li>Wallet balance is always derived from the ledger — cached column is a UI
              hint only.</li>
            <li>Every credit / debit is idempotent (unique txIdempotencyKey per account).</li>
            <li>Row-level locking (pg_advisory_xact_lock) on every wallet mutation.</li>
            <li>OTP: bcrypt-hashed 6-digit codes, 5-min TTL, 3-attempt cap, throttled to
              3 challenges per customer per 10 minutes.</li>
            <li>Every admin action written to the ActivityLog.</li>
            <li>Aadhaar (where used): masked display + irreversible hash only. Never the
              raw number.</li>
            <li>RBAC on every admin surface — cashiers can top up + redeem; managers manage
              benefits + campaigns; owners run the expiry sweep.</li>
          </ul>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground flex items-center gap-1">
        Full architectural spec:{" "}
        <Link href="/wallets" className="text-primary underline">back to Wallets</Link>{" "}
        · Contribute changes to <code>docs/cve-prd.md</code>.
        <ArrowRight className="h-3 w-3" />
      </div>
    </div>
  );
}
