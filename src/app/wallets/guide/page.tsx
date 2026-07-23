import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/rbac";
import { ArrowLeft, ArrowRight, Wallet, Sparkles, Users, ShieldCheck, Clock } from "lucide-react";
import { BUCKET_META, BUCKET_PRIORITY } from "@/lib/cve/types";

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

      {/* ── Buckets ─────────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Buckets — why the wallet is split</CardTitle>
          <CardDescription>
            Every credit lands in a bucket telling us where it came from. Lets us expire promo
            credit without touching real money, and lets us report ROI per source.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md divide-y text-sm">
            {BUCKET_PRIORITY.map((b, i) => (
              <div key={b} className="p-2.5 flex items-center gap-3">
                <div className="flex items-center gap-2 min-w-[180px]">
                  <Badge variant="secondary" className="font-mono text-[10px]">{b}</Badge>
                  <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
                </div>
                <div className="flex-1">
                  <div className="font-medium">{BUCKET_META[b].label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {BUCKET_META[b].hint}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-md border border-sky-300 bg-sky-50/40 p-3 text-xs text-sky-900">
            <div className="font-semibold mb-1 inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Order of consumption at redemption (FIFO)
            </div>
            <ol className="list-decimal ml-4 space-y-0.5">
              <li>Credits with the <b>soonest expiry</b> leave first — otherwise they&apos;d burn.</li>
              <li>Then bucket priority in the order above — CAMPAIGN → CASHBACK → … → PREPAID.</li>
              <li>Within the same bucket, the <b>oldest</b> credit goes first.</li>
            </ol>
            <div className="mt-2 opacity-90">
              Why? Burn the <b>cheapest</b> and <b>most time-limited</b> money first, save the
              customer&apos;s real money for last.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Scenario: 1200 for 1000 ──────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Scenario — &quot;Pay ₹1000, get ₹1200 wallet balance&quot;
          </CardTitle>
          <CardDescription>Cashier flow, step by step.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <ol className="list-decimal ml-5 space-y-1">
            <li>Open <Link href="/wallets" className="text-primary underline">CRM → Wallets</Link> or the customer&apos;s profile</li>
            <li>Click <b>Top up</b> on their row (or in the wallet panel on their profile)</li>
            <li>
              Enter <b>Amount paid: ₹1000</b>, <b>Bonus: ₹200</b>, <b>Payment mode: UPI</b> (or
              cash / card)
            </li>
            <li>Confirm — the customer&apos;s wallet now shows ₹1200 available</li>
          </ol>
          <div className="rounded-md border p-2.5 mt-2 text-xs bg-muted/30">
            <div className="font-semibold mb-1">What&apos;s in the ledger after this</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              <span className="text-muted-foreground">Row 1</span>
              <span className="font-mono">+₹1000 PREPAID — never expires</span>
              <span className="text-muted-foreground">Row 2</span>
              <span className="font-mono">+₹200 CAMPAIGN — expires in 30 days</span>
              <span className="text-muted-foreground">Available</span>
              <span className="font-semibold">₹1200</span>
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground">
            When the customer redeems, the ₹200 bonus drains first (highest bucket priority),
            so the customer doesn&apos;t lose the promo if they take a while to come back.
          </div>
        </CardContent>
      </Card>

      {/* ── Where money enters ───────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Where money enters the wallet</CardTitle>
          <CardDescription>Six paths — the cashier only actively drives one of them (Top-up).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-3">
            <Row label="1. Top-up" bucket="PREPAID + CAMPAIGN">
              Cashier click at the counter — customer paid real money. Bonus goes to CAMPAIGN
              so it can expire; paid part goes to PREPAID and never expires.
            </Row>
            <Row label="2. Cashback" bucket="CASHBACK">
              Configured as a <b>Benefit</b> in <Link href="/admin/cve/benefits" className="text-primary underline">the registry</Link>{" "}
              (e.g. <span className="font-mono">10% of bill, capped ₹100, expires 30 days</span>).
              Attached to a Campaign that fires after settle, or to a membership plan.
            </Row>
            <Row label="3. Campaign bonus" bucket="CAMPAIGN">
              A <Link href="/admin/cve/campaigns" className="text-primary underline">Campaign</Link>{" "}
              with a <span className="font-mono">WALLET_CREDIT</span> benefit — e.g. &quot;₹200
              welcome bonus for first visit&quot;.
            </Row>
            <Row label="4. Membership credit" bucket="MEMBERSHIP">
              A membership plan can grant a wallet credit as one of its benefits — e.g. Gold
              members get ₹500/quarter.
            </Row>
            <Row label="5. Referral / Refund" bucket="REFERRAL / REFUND">
              Wire these later via manual credit for now, or build a campaign that credits on
              referral.
            </Row>
            <Row label="6. Manual adjustment" bucket="MANUAL">
              Manager-only <b>Add credit</b> button — for goodwill (spilled drink), corrections,
              anything outside the normal flows.
            </Row>
          </div>
        </CardContent>
      </Card>

      {/* ── Rules / Memberships / Campaigns ────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Rules, Benefits, Campaigns, Memberships — the 4 concepts
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <Concept
            title="Benefit"
            what="A reward. One row in the Benefit Registry."
            example={`"10% cashback on bill, capped ₹100, into CASHBACK bucket, expires 30d"`}
            where={<Link href="/admin/cve/benefits" className="text-primary underline">/admin/cve/benefits</Link>}
          />
          <Concept
            title="Rule"
            what="A single IF condition — combined with AND / OR to gate a campaign."
            example={`"Membership is GOLD"  AND  "Bill amount ≥ ₹1000"  AND  "Day of week = Wednesday"`}
          />
          <Concept
            title="Campaign"
            what="A time-bound offer. One or more rules + one or more benefits."
            example={`"Weekend flat 20% for members" (rules: MEMBERSHIP + BILL_AMOUNT + DATE_RANGE, benefit: PERCENT_DISCOUNT capped ₹300)`}
            where={<Link href="/admin/cve/campaigns" className="text-primary underline">/admin/cve/campaigns</Link>}
          />
          <Concept
            title="Membership"
            what="A recurring paid plan the customer buys, granting benefits automatically."
            example={`"Tea Club — ₹1000/year — 1 free tea/day"  or  "Gold — ₹5000/year — ₹500 quarterly wallet credit + 10% cashback"`}
            where={<Link href="/memberships" className="text-primary underline">/memberships</Link>}
          />
        </CardContent>
      </Card>

      {/* ── Caps ─────────────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Where do caps live?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <CapRow scope="Per-benefit cap" example="10% cashback, capped ₹100 per bill" where="In the Benefit config" />
          <CapRow scope="Per-customer redemption cap" example="Max 3 uses per customer" where="On the Campaign — Basics tab" />
          <CapRow scope="Total redemption cap" example="Max 1000 uses total" where="On the Campaign — Basics tab" />
          <CapRow scope="Membership daily cap" example="1 free tea per day, across outlets" where="On the legacy per-day benefit — DB-enforced" />
          <CapRow scope="Wallet expiry" example="Campaign credit expires in 30 days" where="In the Benefit / Top-up config" />
          <CapRow scope="OTP throttle" example="3 codes per 10 min · 5-min TTL · 3 attempts" where="Hard-coded — not admin-configurable" />
        </CardContent>
      </Card>

      {/* ── Redeem at POS ───────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">How wallet redemption works at the POS</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <ol className="list-decimal ml-5 space-y-1">
            <li>Attach the customer to the bill (existing flow — no change).</li>
            <li>Open the customer&apos;s profile or the wallet panel; click <b>Redeem</b>.</li>
            <li>Enter the amount to redeem (max = live balance).</li>
            <li>System sends a 6-digit OTP to the customer&apos;s phone.</li>
            <li>Customer reads it out. Cashier types it into the dialog.</li>
            <li>Wallet debits FIFO. The debit gets a <b>drawsFromJson</b> audit trail
              showing exactly which credit rows funded it.</li>
          </ol>
          <div className="rounded-md border border-amber-300 bg-amber-50/40 p-2.5 text-xs text-amber-900 mt-2">
            Auto-application of the redeemed amount as a discount on the bill total is a
            separate wiring — for now the cashier applies it manually. Everything else in
            the loop (OTP → ledger → history) is already live.
          </div>
        </CardContent>
      </Card>

      {/* ── Where to click ───────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Where to click</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <Where title="See every wallet"    to="/wallets"                icon={<Wallet className="h-4 w-4" />} />
          <Where title="Top up a customer"   to="/wallets"                icon={<Sparkles className="h-4 w-4" />} />
          <Where title="Redeem at billing"   to="/customers"              icon={<ArrowRight className="h-4 w-4" />} />
          <Where title="Manage benefits"     to="/admin/cve/benefits"     icon={<Sparkles className="h-4 w-4" />} />
          <Where title="Manage campaigns"    to="/admin/cve/campaigns"    icon={<Sparkles className="h-4 w-4" />} />
          <Where title="Manage memberships"  to="/memberships"            icon={<Users className="h-4 w-4" />} />
          <Where title="Liability + ROI"     to="/admin/cve"              icon={<ShieldCheck className="h-4 w-4" />} />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── little presentational helpers ─────────────────────────────────────

function Row({ label, bucket, children }: { label: string; bucket: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-2.5">
      <div className="flex items-center justify-between mb-1">
        <div className="font-medium text-sm">{label}</div>
        <Badge variant="secondary" className="font-mono text-[9px]">→ {bucket}</Badge>
      </div>
      <div className="text-[12px] text-muted-foreground">{children}</div>
    </div>
  );
}

function Concept({
  title,
  what,
  example,
  where,
}: {
  title: string;
  what: string;
  example: string;
  where?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border p-2.5">
      <div className="font-semibold text-sm">{title}</div>
      <div className="text-[12px] text-muted-foreground mt-0.5">{what}</div>
      <div className="mt-1.5 text-[12px]">
        <span className="text-muted-foreground">Example: </span>
        <span className="font-mono">{example}</span>
      </div>
      {where ? (
        <div className="mt-1 text-[11px]">
          <span className="text-muted-foreground">Configure here: </span>
          {where}
        </div>
      ) : null}
    </div>
  );
}

function CapRow({ scope, example, where }: { scope: string; example: string; where: string }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-2 items-start rounded-md border p-2">
      <div className="text-xs font-semibold">{scope}</div>
      <div className="text-xs">
        <div className="text-muted-foreground">e.g. {example}</div>
        <div className="text-[11px] text-primary/80 mt-0.5">{where}</div>
      </div>
    </div>
  );
}

function Where({ title, to, icon }: { title: string; to: string; icon: React.ReactNode }) {
  return (
    <Link
      href={to}
      className="rounded-md border p-2.5 hover:border-primary/50 hover:bg-accent/30 transition-colors flex items-center justify-between"
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
    </Link>
  );
}
