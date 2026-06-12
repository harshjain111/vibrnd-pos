import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, ChefHat, Sofa, Sparkles, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { stockAtDepartment } from "@/lib/stock";

export const dynamic = "force-dynamic";

const KIND_META: Record<string, { Icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  STORE: { Icon: Sofa, tone: "border-sky-300 bg-sky-50/40 text-sky-900" },
  KITCHEN: { Icon: ChefHat, tone: "border-amber-300 bg-amber-50/40 text-amber-900" },
  BAR: { Icon: Sparkles, tone: "border-purple-300 bg-purple-50/40 text-purple-900" },
  HOUSEKEEPING: { Icon: Wrench, tone: "border-emerald-300 bg-emerald-50/40 text-emerald-900" },
  OTHER: { Icon: Sofa, tone: "border-slate-300 bg-slate-50/40 text-slate-900" },
};

export default async function DepartmentStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const search = sp.q ?? "";
  const outlet = await getActiveOutlet();

  const dept = await db.department.findFirst({
    where: { id, outletId: outlet.id, active: true },
  });
  if (!dept) return notFound();

  const rms = await db.rawMaterial.findMany({
    where: { outletId: outlet.id, active: true },
    select: {
      id: true,
      name: true,
      unit: true,
      avgCost: true,
      parLevel: true,
      minLevel: true,
      currentQty: true,
      source: true,
    },
    orderBy: { name: "asc" },
  });

  // Per-dept qty from the ledger.
  const rows = await Promise.all(
    rms.map(async (rm) => ({
      rm,
      qtyAtDept: await stockAtDepartment(rm.id, dept.id),
    }))
  );

  // Filter
  const visible = search
    ? rows.filter((r) => r.rm.name.toLowerCase().includes(search.toLowerCase()))
    : rows;

  // Hide zero rows by default for non-STORE depts — KITCHEN / BAR / HK
  // catalog would otherwise show every catalog item as zero.
  const showZeros = dept.kind === "STORE";
  const visibleNonZero = showZeros ? visible : visible.filter((r) => r.qtyAtDept > 0);

  const totalValue = visibleNonZero.reduce(
    (s, r) => s + r.qtyAtDept * r.rm.avgCost,
    0
  );
  const lowItems = visibleNonZero.filter(
    (r) => r.qtyAtDept > 0 && r.qtyAtDept < r.rm.parLevel
  ).length;

  const meta = KIND_META[dept.kind] ?? KIND_META.OTHER;
  const Icon = meta.Icon;

  return (
    <div>
      <PageHeader
        title={dept.name}
        description={`${dept.kind.toLowerCase()} department · ${outlet.name}`}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/inventory/dashboard">
                <ArrowLeft className="h-4 w-4" />
                Inventory
              </Link>
            </Button>
            {dept.kind !== "STORE" && (
              <Button size="sm" asChild>
                <Link href={`/inventory/requisitions/new`}>
                  <Plus className="h-4 w-4" />
                  Request from store
                </Link>
              </Button>
            )}
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <Card className={`border-2 ${meta.tone}`}>
          <CardContent className="p-3 flex items-center gap-3">
            <Icon className="h-5 w-5 opacity-70" />
            <div>
              <div className="text-[10px] uppercase tracking-wider opacity-70">Items on hand</div>
              <div className="text-2xl font-semibold leading-none mt-0.5">
                {visibleNonZero.length}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider opacity-70">Stock value</div>
            <div className="text-2xl font-semibold leading-none mt-0.5">
              ₹{Math.round(totalValue).toLocaleString("en-IN")}
            </div>
            <div className="text-[10px] opacity-70 mt-1">at avg cost</div>
          </CardContent>
        </Card>
        <Card className={lowItems > 0 ? "border-amber-300 bg-amber-50/40" : ""}>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider opacity-70">Below par</div>
            <div className={`text-2xl font-semibold leading-none mt-0.5 ${lowItems > 0 ? "text-amber-800" : ""}`}>
              {lowItems}
            </div>
            <div className="text-[10px] opacity-70 mt-1">items short</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <form className="mb-3">
        <input
          name="q"
          defaultValue={search}
          placeholder="Search items…"
          className="h-9 rounded-md border bg-background px-3 text-sm w-full md:w-80"
        />
      </form>

      <Card>
        <CardContent className="p-0">
          {visibleNonZero.length === 0 ? (
            <Empty
              title={search ? "Nothing matches" : `Nothing in ${dept.name.toLowerCase()} yet`}
              desc={
                search
                  ? "Try a different search."
                  : dept.kind === "STORE"
                    ? "Items show up here when a GRN lands or a chain transfer is received."
                    : "Items show up here once your store fulfils a requisition from this department."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Avg cost</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Par level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleNonZero.map((r) => {
                  const low = r.qtyAtDept > 0 && r.qtyAtDept < r.rm.parLevel;
                  const value = r.qtyAtDept * r.rm.avgCost;
                  return (
                    <TableRow key={r.rm.id} className="hover:bg-accent/30">
                      <TableCell>
                        <div className="font-medium inline-flex items-center gap-1.5">
                          {r.rm.name}
                          {(r.rm.source === "PRODUCED" || r.rm.source === "BOTH") && (
                            <Badge variant="info" className="text-[8px]">PROD</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className={low ? "text-amber-700 font-semibold" : ""}>
                          {r.qtyAtDept.toFixed(2)}{" "}
                          <span className="text-[10px] text-muted-foreground">{r.rm.unit}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                        ₹{r.rm.avgCost.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        ₹{Math.round(value).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                        {r.rm.parLevel}
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
        On-hand quantity is computed from the stock-movement ledger filtered to (item ×{" "}
        {dept.name.toLowerCase()}). STORE-kind departments also include legacy
        un-backfilled movements from before chain inventory landed.
      </div>
    </div>
  );
}
