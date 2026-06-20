import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import { FilterBar } from "@/components/ui/filter-bar";
import { Boxes } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

function midnight(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }

export default async function StockSummaryPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const outlet = await getActiveOutlet();

  const today = midnight(new Date());
  const from = midnight(sp.from ? new Date(sp.from) : new Date(today.getTime() - 7 * 86400000));
  const to = midnight(sp.to ? new Date(sp.to) : today);
  const toEnd = new Date(to);
  toEnd.setHours(23, 59, 59, 999);

  const rms = await db.rawMaterial.findMany({
    where: { outletId: outlet.id, active: true },
    orderBy: { name: "asc" },
  });

  // Pull movements once and group by RM
  const movements = await db.stockMovement.findMany({
    where: {
      outletId: outlet.id,
      createdAt: { gte: from, lte: toEnd },
    },
  });
  const byRm = new Map<string, typeof movements>();
  for (const m of movements) {
    const arr = byRm.get(m.rawMaterialId) ?? [];
    arr.push(m);
    byRm.set(m.rawMaterialId, arr);
  }

  // Opening qty = currentQty - sum(deltas in window) — best-effort approximation
  // because we don't keep snapshots before each move.
  const finalCount = await db.stockCount.findFirst({
    where: { outletId: outlet.id, businessDay: { lte: to } },
    include: { lines: true },
    orderBy: { businessDay: "desc" },
  });
  const countMap = new Map(finalCount?.lines.map((l) => [l.rawMaterialId, l.countedQty]) ?? []);

  const rows = rms.map((rm) => {
    const ms = byRm.get(rm.id) ?? [];
    const sumBy = (reasons: string[]) => ms.filter((m) => reasons.includes(m.reason)).reduce((s, m) => s + m.delta, 0);

    const B = sumBy(["PURCHASE"]);
    const D = -sumBy(["SALE"]); // SALE deltas are negative → flip sign
    const E = -sumBy(["WASTAGE"]);
    const G_in = sumBy(["TRANSFER_IN"]);
    const G_out = -sumBy(["TRANSFER_OUT"]);
    const G = G_out - G_in;
    const I = sumBy(["PRODUCTION_IN"]) + sumBy(["PRODUCTION_OUT"]); // PRODUCTION_OUT is negative
    const adjustments = sumBy(["ADJUST", "COUNT_ADJUST", "OPENING"]);
    const C = adjustments > 0 ? adjustments : 0;
    const H = adjustments < 0 ? -adjustments : 0;
    const F = 0; // normal loss not yet tracked separately
    const A = rm.currentQty - (B + C - D - E - F - G - H + I);
    const totalClosing = A + B + C - D - E - F - G - H + I;
    const physical = countMap.get(rm.id) ?? null;
    const diff = physical !== null ? physical - totalClosing : null;
    const unit = rm.consumptionUnit ?? rm.unit;
    return { rm, unit, A, B, C, D, E, F, G, H, I, totalClosing, physical, diff };
  });

  const fmt = (n: number) => n.toFixed(2);

  return (
    <div>
      <PageHeader
        title="Stock Summary Report"
        description={`Variance reconciliation · ${fmtDate(from)} → ${fmtDate(to)}`}
      />
      <FilterBar action="/inventory/reports/summary" showSearch={false} showClear={false} className="mb-3">
        <div>
          <Label className="text-xs text-muted-foreground block mb-1">From</Label>
          <Input name="from" type="date" defaultValue={from.toISOString().slice(0, 10)} className="w-auto" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground block mb-1">To</Label>
          <Input name="to" type="date" defaultValue={to.toISOString().slice(0, 10)} className="w-auto" />
        </div>
      </FilterBar>

      {rms.length === 0 ? (
        <Card><CardContent><Empty icon={Boxes} title="No raw materials" desc="Create one in Inventory · Masters · Raw Materials." /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="sticky left-0 bg-background">Raw Material</TableHead>
                  <TableHead className="text-right" title="A — Opening">A · Open</TableHead>
                  <TableHead className="text-right" title="B — Purchase">B · Purch</TableHead>
                  <TableHead className="text-right" title="C — Excess">C · Excess</TableHead>
                  <TableHead className="text-right" title="D — Total Consumed">D · Cons</TableHead>
                  <TableHead className="text-right" title="E — Wastage">E · Waste</TableHead>
                  <TableHead className="text-right" title="F — Normal Loss">F · Loss</TableHead>
                  <TableHead className="text-right" title="G — Transfer (net out)">G · Xfer</TableHead>
                  <TableHead className="text-right" title="H — Shortage">H · Short</TableHead>
                  <TableHead className="text-right" title="I — Production (net)">I · Prod</TableHead>
                  <TableHead className="text-right">Computed</TableHead>
                  <TableHead className="text-right">Physical</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.rm.id} className="text-xs">
                    <TableCell className="sticky left-0 bg-background font-medium">
                      {r.rm.name}
                      <div className="text-[10px] text-muted-foreground">{r.unit}</div>
                    </TableCell>
                    <TableCell className="text-right">{fmt(r.A)}</TableCell>
                    <TableCell className="text-right text-emerald-700">{fmt(r.B)}</TableCell>
                    <TableCell className="text-right">{fmt(r.C)}</TableCell>
                    <TableCell className="text-right text-rose-700">{fmt(r.D)}</TableCell>
                    <TableCell className="text-right text-amber-700">{fmt(r.E)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmt(r.F)}</TableCell>
                    <TableCell className="text-right">{fmt(r.G)}</TableCell>
                    <TableCell className="text-right text-rose-700">{fmt(r.H)}</TableCell>
                    <TableCell className="text-right">{fmt(r.I)}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(r.totalClosing)}</TableCell>
                    <TableCell className="text-right">{r.physical === null ? "—" : fmt(r.physical)}</TableCell>
                    <TableCell className="text-right">
                      {r.diff === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : Math.abs(r.diff) < 0.01 ? (
                        <Badge variant="success" className="text-[10px]">0</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px]">{fmt(r.diff)}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="mt-3 text-xs text-muted-foreground">
        <strong>Formula:</strong> Total Closing = A + B + C − D − E − F − G − H + I.
        Variance = Physical − Computed. Non-zero variances indicate unaccounted shortfall (theft, spoilage, missed entries).
      </div>
    </div>
  );
}
