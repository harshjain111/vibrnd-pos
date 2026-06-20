/**
 * Requisition variance report — per-line tally of:
 *   requested → approved (SM review)
 *           → sent      (transfer qtySent)
 *           → received  (transfer qtyReceived)
 *
 * The chain has four checkpoints; mismatches surface different problems:
 *   • requested > approved        → SM downgraded (short-decline; saves food cost)
 *   • approved  > sent            → physical/stocking shortfall at supplier
 *   • sent      > received        → in-transit loss (driver/spillage/theft)
 *
 * Each gap colour-codes amber/rose so a chain operator can scan a week's
 * requisitions and see where stock leaks live.
 */
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { canAccess } from "@/lib/permissions";
import { ArrowDown, ArrowUp, Equal, ClipboardList } from "lucide-react";

export const dynamic = "force-dynamic";

type RangeKey = "last7" | "last30" | "last90";
const RANGE_DAYS: Record<RangeKey, number> = { last7: 7, last30: 30, last90: 90 };

export default async function RequisitionVariancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: RangeKey; outlet?: string }>;
}) {
  const user = await requireUser();
  if (!canAccess(user.role, "inventory.reports.requisition-variance")) {
    return (
      <div>
        <PageHeader title="Requisition variance" description="Forbidden" />
        <Card>
          <CardContent>
            <Empty title="Restricted" desc="Only Manager / Owner / Store Manager." />
          </CardContent>
        </Card>
      </div>
    );
  }

  const sp = await searchParams;
  const range = (sp.range ?? "last30") as RangeKey;
  const outletFilter = sp.outlet ?? "";
  const since = new Date();
  since.setDate(since.getDate() - RANGE_DAYS[range]);

  const outlets = await db.outlet.findMany({
    where: { active: true },
    select: { id: true, name: true, code: true, kind: true },
    orderBy: { createdAt: "asc" },
  });
  const outletById = new Map(outlets.map((o) => [o.id, o]));

  const reqs = await db.requisition.findMany({
    where: {
      createdAt: { gte: since },
      ...(outletFilter ? { outletId: outletFilter } : {}),
    },
    include: {
      lines: { include: { rawMaterial: { select: { name: true, unit: true } } } },
      transfer: { include: { lines: true } },
      outlet: { select: { name: true, code: true } },
      fromDepartment: { select: { name: true, outletId: true } },
      toDepartment: { select: { name: true, outletId: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  // Per-line variance calc.
  type LineVariance = {
    reqId: string;
    reqNo: string;
    outletName: string;
    direction: "INTERNAL" | "CHAIN_OUT";
    fromDept: string;
    toDept: string;
    item: string;
    unit: string;
    requested: number;
    approved: number;
    sent: number;
    received: number;
    status: string;
    /** Largest single-step gap as a fraction of qtyRequested. */
    worstGap: number;
    worstGapStep: "approve" | "send" | "receive" | "none";
  };
  const linesAll: LineVariance[] = [];
  for (const r of reqs) {
    const transferLineByRm = new Map<string, { qtySent: number; qtyReceived: number }>();
    if (r.transfer) {
      for (const tl of r.transfer.lines) {
        // The transfer's rawMaterialId can be either the supplier's or the
        // requester's RM id depending on internal vs chain — the requisition
        // line is keyed by the requester's RM id, so chain transfers won't
        // match directly. We accept that and treat them as "no data for
        // received qty" — the chain-stock matrix is the better truth for
        // CHAIN deliveries.
        transferLineByRm.set(tl.rawMaterialId, {
          qtySent: tl.qtySent ?? 0,
          qtyReceived: tl.qtyReceived ?? 0,
        });
      }
    }
    const isCrossOutlet = r.fromDepartment.outletId !== r.toDepartment.outletId;
    for (const l of r.lines) {
      const tline = transferLineByRm.get(l.rawMaterialId);
      const sent = tline?.qtySent ?? 0;
      const received = tline?.qtyReceived ?? 0;
      // Compute step gaps as fraction of original request.
      const approveGap = l.qtyRequested > 0 ? (l.qtyRequested - l.qtyApproved) / l.qtyRequested : 0;
      const sendGap = l.qtyApproved > 0 ? (l.qtyApproved - sent) / l.qtyApproved : 0;
      const receiveGap = sent > 0 ? (sent - received) / sent : 0;
      let worstGap = 0;
      let worstGapStep: LineVariance["worstGapStep"] = "none";
      if (approveGap > worstGap) {
        worstGap = approveGap;
        worstGapStep = "approve";
      }
      if (r.transfer && sendGap > worstGap) {
        worstGap = sendGap;
        worstGapStep = "send";
      }
      if (r.transfer && receiveGap > worstGap) {
        worstGap = receiveGap;
        worstGapStep = "receive";
      }
      linesAll.push({
        reqId: r.id,
        reqNo: r.reqNo,
        outletName: r.outlet.name,
        direction: isCrossOutlet ? "CHAIN_OUT" : "INTERNAL",
        fromDept: r.fromDepartment.name,
        toDept: r.toDepartment.name,
        item: l.rawMaterial.name,
        unit: l.unit,
        requested: l.qtyRequested,
        approved: l.qtyApproved,
        sent,
        received,
        status: r.status,
        worstGap,
        worstGapStep,
      });
    }
  }

  const totalRequested = linesAll.reduce((s, l) => s + l.requested, 0);
  const totalApproved = linesAll.reduce((s, l) => s + l.approved, 0);
  const totalSent = linesAll.reduce((s, l) => s + l.sent, 0);
  const totalReceived = linesAll.reduce((s, l) => s + l.received, 0);
  const linesWithGap = linesAll.filter((l) => l.worstGap > 0.01).length;

  return (
    <div>
      <PageHeader
        title="Requisition variance"
        description={`Last ${RANGE_DAYS[range]} days — ${reqs.length} requisitions · ${linesAll.length} lines`}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {(["last7", "last30", "last90"] as RangeKey[]).map((r) => (
          <Link
            key={r}
            href={{ pathname: "/inventory/reports/requisition-variance", query: { range: r, outlet: outletFilter || undefined } }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
              range === r ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"
            }`}
          >
            {RANGE_DAYS[r]}d
          </Link>
        ))}
        <select
          value={outletFilter}
          onChange={(e) => {
            const v = e.target.value;
            window.location.href = `/inventory/reports/requisition-variance?range=${range}${v ? `&outlet=${v}` : ""}`;
          }}
          className="h-9 rounded-md border bg-background px-3 text-xs"
        >
          <option value="">All outlets</option>
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      {/* KPI strip */}
      <StatGrid cols={4} className="mb-4">
        <StatCard label="Requested" value={`${totalRequested.toFixed(1)} lines`} />
        <StatCard
          label="Approved"
          value={`${totalApproved.toFixed(1)} lines`}
          subline={pct(totalApproved, totalRequested) !== null ? `${pct(totalApproved, totalRequested)}% of prior step` : undefined}
        />
        <StatCard
          label="Sent"
          value={`${totalSent.toFixed(1)} lines`}
          subline={pct(totalSent, totalApproved) !== null ? `${pct(totalSent, totalApproved)}% of prior step` : undefined}
        />
        <StatCard
          label="Received"
          value={`${totalReceived.toFixed(1)} lines`}
          subline={pct(totalReceived, totalSent) !== null ? `${pct(totalReceived, totalSent)}% of prior step` : undefined}
          tone={linesWithGap > 0 ? "warn" : "good"}
        />
      </StatGrid>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Per-line variance ({linesAll.length})</CardTitle>
          <CardDescription>
            Showing the biggest gap per line — amber = 10–25% shortfall, rose = ≥25%. CHAIN_OUT
            lines may show no sent / received data because chain transfer lines reference the
            supplier outlet's RM ids (catalog-by-name v1 limitation).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {linesAll.length === 0 ? (
            <Empty icon={ClipboardList} title="Nothing in range" desc="Try a wider date range or different outlet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Req</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Requested</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead>Biggest gap</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linesAll
                  .sort((a, b) => b.worstGap - a.worstGap)
                  .slice(0, 200)
                  .map((l, idx) => (
                    <TableRow key={`${l.reqId}-${idx}`} className="hover:bg-accent/30">
                      <TableCell>
                        <Link href={`/inventory/requisitions/${l.reqId}`} className="font-mono text-[10px] hover:underline">
                          {l.reqNo}
                        </Link>
                        <div className="text-[10px] text-muted-foreground">
                          {l.outletName} · {l.direction === "CHAIN_OUT" ? "chain" : "internal"}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {l.item}
                        <span className="text-[10px] text-muted-foreground ml-1">{l.unit}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{l.requested}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <QtyCell qty={l.approved} prev={l.requested} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <QtyCell qty={l.sent} prev={l.approved} hideIfZero={l.direction === "CHAIN_OUT"} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <QtyCell qty={l.received} prev={l.sent} hideIfZero={l.direction === "CHAIN_OUT"} />
                      </TableCell>
                      <TableCell>
                        <GapBadge gap={l.worstGap} step={l.worstGapStep} />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function pct(a: number, b: number): number | null {
  if (b <= 0) return null;
  return Math.round((a / b) * 100);
}

function QtyCell({ qty, prev, hideIfZero }: { qty: number; prev: number; hideIfZero?: boolean }) {
  if (qty === 0 && hideIfZero) return <span className="text-muted-foreground">—</span>;
  if (prev === 0) return <span>{qty}</span>;
  const diff = qty - prev;
  const isShort = diff < -0.001;
  const isMore = diff > 0.001;
  return (
    <span className={isShort ? "text-rose-700 font-medium" : isMore ? "text-amber-700" : ""}>
      {qty}
      {isShort && <ArrowDown className="inline h-3 w-3 ml-0.5" />}
      {isMore && <ArrowUp className="inline h-3 w-3 ml-0.5" />}
      {!isShort && !isMore && <Equal className="inline h-3 w-3 ml-0.5 text-muted-foreground" />}
    </span>
  );
}

function GapBadge({ gap, step }: { gap: number; step: string }) {
  if (gap < 0.01) {
    return (
      <Badge variant="success" className="text-[9px]">
        clean
      </Badge>
    );
  }
  const pct = Math.round(gap * 100);
  const tone = gap >= 0.25 ? "destructive" : "warning";
  return (
    <Badge variant={tone} className="text-[9px]">
      {pct}% @ {step}
    </Badge>
  );
}
