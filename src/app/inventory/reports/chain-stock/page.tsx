/**
 * Chain-stock matrix — one RawMaterial per row, every (outlet, dept) pair
 * as a column. Owner / Manager see everything; cross-outlet users can pivot
 * by category + low-stock filter.
 *
 * Per-cell qty is computed by summing the StockMovement ledger filtered to
 * that (rawMaterialId, departmentId) tuple — same `stockAtDepartment`
 * helper used by requisitions. For STORE dept we include legacy null-dept
 * rows (pre-backfill) so the historical baseline doesn't drift.
 *
 * Chain catalogs match raw materials by NAME — an "Onion" row aggregates
 * the per-outlet Onion entries across every BS / BK / Outlet. The chain
 * total column sums them.
 */
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { canAccess } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";
import { Download, AlertCircle } from "lucide-react";
import { ChainStockClient } from "./client";

export const dynamic = "force-dynamic";

type CellKey = string; // `${outletId}::${deptId}` for the matrix coords

export default async function ChainStockMatrixPage({
  searchParams,
}: {
  searchParams: Promise<{ low?: string; cat?: string }>;
}) {
  const user = await requireUser();
  if (!canAccess(user.role, "inventory.dashboard")) {
    // Chain stock is gated to OWNER / MANAGER chain-wide oversight.
    return (
      <div>
        <PageHeader title="Chain stock" description="Forbidden" />
        <Card>
          <CardContent>
            <Empty title="Restricted" desc="Only Owner and Manager can view chain-wide stock." />
          </CardContent>
        </Card>
      </div>
    );
  }

  const sp = await searchParams;
  const lowOnly = sp.low === "1";
  const filterCat = sp.cat ?? "";

  // Outlets + departments form the matrix columns.
  const outlets = await db.outlet.findMany({
    where: { active: true },
    select: { id: true, name: true, code: true, kind: true },
    orderBy: { createdAt: "asc" },
  });
  const depts = await db.department.findMany({
    where: { active: true, outlet: { active: true } },
    select: { id: true, name: true, kind: true, outletId: true },
    orderBy: [{ outletId: "asc" }, { kind: "asc" }],
  });
  const deptsByOutlet = new Map<string, typeof depts>();
  for (const d of depts) {
    const arr = deptsByOutlet.get(d.outletId) ?? [];
    arr.push(d);
    deptsByOutlet.set(d.outletId, arr);
  }

  // All RawMaterials chain-wide, grouped by name (chain-catalog merge).
  const rms = await db.rawMaterial.findMany({
    where: { active: true, outlet: { active: true } },
    select: {
      id: true,
      name: true,
      unit: true,
      avgCost: true,
      parLevel: true,
      minLevel: true,
      categoryName: true,
      source: true,
      outletId: true,
    },
    orderBy: { name: "asc" },
  });
  const rmByName = new Map<string, typeof rms>();
  for (const r of rms) {
    const arr = rmByName.get(r.name) ?? [];
    arr.push(r);
    rmByName.set(r.name, arr);
  }
  const distinctNames = Array.from(rmByName.keys()).sort();

  // Per (rawMaterialId, departmentId) qty — sum delta.
  const allRmIds = rms.map((r) => r.id);
  const deptIds = depts.map((d) => d.id);
  const movements = await db.stockMovement.groupBy({
    by: ["rawMaterialId", "departmentId"],
    where: { rawMaterialId: { in: allRmIds } },
    _sum: { delta: true },
  });
  const qtyByCell = new Map<CellKey, number>();
  for (const m of movements) {
    if (m.departmentId) {
      qtyByCell.set(`${m.rawMaterialId}::${m.departmentId}`, Number(m._sum.delta ?? 0));
    }
  }
  // Special-case STORE for legacy null-dept rows: assign to outlet's STORE.
  const storeByOutlet = new Map<string, string>();
  for (const d of depts) {
    if (d.kind === "STORE") storeByOutlet.set(d.outletId, d.id);
  }
  const nullMovements = movements.filter((m) => !m.departmentId);
  // Hydrate nullDept movements' outletIds via rm.outletId
  const rmOutlet = new Map(rms.map((r) => [r.id, r.outletId]));
  for (const m of nullMovements) {
    const oid = rmOutlet.get(m.rawMaterialId);
    if (!oid) continue;
    const storeId = storeByOutlet.get(oid);
    if (!storeId) continue;
    const k = `${m.rawMaterialId}::${storeId}`;
    qtyByCell.set(k, (qtyByCell.get(k) ?? 0) + Number(m._sum.delta ?? 0));
  }

  // Build the row data.
  type Row = {
    name: string;
    unit: string;
    category: string;
    chainTotal: number;
    parLevel: number;
    cells: Map<CellKey, number>; // (outletId::deptId) → qty at that cell
    isLow: boolean;
    isProduced: boolean;
  };
  const rows: Row[] = distinctNames.map((name) => {
    const variants = rmByName.get(name)!;
    const unit = variants[0].unit;
    const category = variants[0].categoryName ?? "";
    const isProduced = variants.some((v) => v.source === "PRODUCED" || v.source === "BOTH");
    const cells = new Map<CellKey, number>();
    let total = 0;
    for (const rm of variants) {
      const outletDepts = deptsByOutlet.get(rm.outletId) ?? [];
      for (const d of outletDepts) {
        const k = `${rm.id}::${d.id}`;
        const q = qtyByCell.get(k) ?? 0;
        if (q !== 0) {
          const cellK: CellKey = `${rm.outletId}::${d.id}`;
          cells.set(cellK, (cells.get(cellK) ?? 0) + q);
          total += q;
        }
      }
    }
    const parLevel = Math.max(...variants.map((v) => v.parLevel ?? 0));
    return { name, unit, category, chainTotal: total, parLevel, cells, isLow: total < parLevel, isProduced };
  });

  // Filters
  let visibleRows = rows;
  if (lowOnly) visibleRows = visibleRows.filter((r) => r.isLow);
  if (filterCat) visibleRows = visibleRows.filter((r) => r.category === filterCat);
  const categories = Array.from(new Set(rows.map((r) => r.category).filter(Boolean))).sort();

  return (
    <div>
      <PageHeader
        title="Chain-wide stock matrix"
        description={`${rows.length} unique items across ${outlets.length} outlets · ${depts.length} departments`}
      />

      <ChainStockClient
        outlets={outlets.map((o) => ({ id: o.id, name: o.name, code: o.code, kind: (o as any).kind ?? "OUTLET" }))}
        departments={depts.map((d) => ({ id: d.id, name: d.name, kind: d.kind, outletId: d.outletId }))}
        rows={visibleRows.map((r) => ({
          name: r.name,
          unit: r.unit,
          category: r.category,
          chainTotal: r.chainTotal,
          parLevel: r.parLevel,
          isLow: r.isLow,
          isProduced: r.isProduced,
          cells: Object.fromEntries(r.cells),
        }))}
        categories={categories}
        activeFilters={{ low: lowOnly, cat: filterCat }}
      />
    </div>
  );
}
