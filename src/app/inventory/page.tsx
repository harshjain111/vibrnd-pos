import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { Plus, AlertTriangle, Boxes, Search, Users, X } from "lucide-react";
import { ManageRmSuppliersDialog, RmDialog, StockAdjust } from "./client";

export const dynamic = "force-dynamic";

type SP = { filter?: string; q?: string; cat?: string; sub?: string };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const outlet = await getActiveOutlet();
  const sp = await searchParams;
  const search = (sp.q ?? "").trim();
  const cat = (sp.cat ?? "").trim();
  const sub = (sp.sub ?? "").trim();
  const onlyUncovered = sp.filter === "uncovered";

  const [rms, suppliers] = await Promise.all([
    db.rawMaterial.findMany({
      where: { outletId: outlet.id },
      include: {
        supplier: true,
        rmSuppliers: {
          include: { supplier: { select: { id: true, name: true } } },
          orderBy: { isPrimary: "desc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  // Distinct category + sub-category values, for the search filters AND the
  // Add-RM dialog's smart dropdown. Built off the existing free-text fields
  // so we don't need a separate taxonomy table.
  const categories = Array.from(
    new Set(rms.map((r) => r.categoryName).filter((v): v is string => !!v && v.trim().length > 0))
  ).sort((a, b) => a.localeCompare(b));
  const subCategoriesByCategory: Record<string, string[]> = {};
  for (const r of rms) {
    if (!r.categoryName || !r.subCategory) continue;
    const list = (subCategoriesByCategory[r.categoryName] ??= []);
    if (!list.includes(r.subCategory)) list.push(r.subCategory);
  }
  for (const k of Object.keys(subCategoriesByCategory)) {
    subCategoriesByCategory[k].sort((a, b) => a.localeCompare(b));
  }

  // Apply filters.
  const lowered = search.toLowerCase();
  const visible = rms.filter((r) => {
    if (onlyUncovered && r.rmSuppliers.length > 0) return false;
    if (cat && r.categoryName !== cat) return false;
    if (sub && r.subCategory !== sub) return false;
    if (lowered && !r.name.toLowerCase().includes(lowered)) return false;
    return true;
  });

  const stockWorth = rms.reduce((s, r) => s + r.avgCost * r.currentQty, 0);
  const belowMin = rms.filter((r) => r.currentQty < r.minLevel);
  const belowPar = rms.filter((r) => r.currentQty >= r.minLevel && r.currentQty < r.parLevel);
  const uncoveredCount = rms.filter((r) => r.rmSuppliers.length === 0).length;

  // Helper: build a URL that preserves all other filters.
  const buildHref = (overrides: Partial<SP>) => {
    const next = { filter: onlyUncovered ? "uncovered" : undefined, q: search || undefined, cat: cat || undefined, sub: sub || undefined, ...overrides };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, String(v));
    const s = qs.toString();
    return s ? `/inventory?${s}` : "/inventory";
  };

  const subOptions = cat ? subCategoriesByCategory[cat] ?? [] : [];
  const hasAnyFilter = !!(search || cat || sub || onlyUncovered);

  const supplierOptions = suppliers.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div>
      <PageHeader
        title="Raw materials"
        description={`Inventory master · ${rms.length - uncoveredCount}/${rms.length} items have a rate-card supplier`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/inventory/suppliers">Suppliers</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/inventory/recipes">Recipes</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/inventory/movements">Movements</Link>
            </Button>
            <RmDialog
              suppliers={supplierOptions}
              categories={categories}
              subCategoriesByCategory={subCategoriesByCategory}
            >
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Raw material
              </Button>
            </RmDialog>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <KpiCard label="Stock worth" value={inr(stockWorth)} icon={<Boxes className="h-4 w-4" />} />
        <KpiCard label="Below min level" value={String(belowMin.length)} tone={belowMin.length ? "warn" : "neutral"} icon={<AlertTriangle className="h-4 w-4" />} />
        <KpiCard label="Below par level" value={String(belowPar.length)} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      {/* Filter strip + search */}
      <form method="get" action="/inventory" className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            name="q"
            defaultValue={search}
            placeholder="Search by name…"
            className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm"
          />
        </div>
        <select
          name="cat"
          defaultValue={cat}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          name="sub"
          defaultValue={sub}
          disabled={!cat}
          className="h-9 rounded-md border bg-background px-3 text-sm disabled:opacity-50"
          title={cat ? "" : "Pick a category first"}
        >
          <option value="">All sub-categories</option>
          {subOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {onlyUncovered && <input type="hidden" name="filter" value="uncovered" />}
        <Button type="submit" size="sm">Apply</Button>
        {hasAnyFilter && (
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href="/inventory">
              <X className="h-3.5 w-3.5" /> Clear
            </Link>
          </Button>
        )}
      </form>

      {/* Quick filter chips (preserves search/cat/sub) */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <Link
          href={buildHref({ filter: undefined })}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
            onlyUncovered ? "bg-background hover:bg-accent" : "bg-primary text-primary-foreground border-primary"
          }`}
        >
          All items
          <Badge variant="outline" className="text-[10px] bg-background/50">
            {rms.length}
          </Badge>
        </Link>
        <Link
          href={buildHref({ filter: "uncovered" })}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
            onlyUncovered
              ? "bg-amber-500 text-white border-amber-500"
              : uncoveredCount > 0
                ? "bg-background border-amber-300 text-amber-800 hover:bg-amber-50"
                : "bg-background hover:bg-accent"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Needs supplier
          <Badge variant="outline" className={`text-[10px] ${onlyUncovered ? "bg-white/30 border-white/40 text-white" : "bg-background/50"}`}>
            {uncoveredCount}
          </Badge>
        </Link>
      </div>

      {belowMin.length > 0 && (
        <Card className="mb-4 border-amber-300 bg-amber-50/40">
          <CardHeader>
            <CardTitle className="text-amber-900">Low stock alert</CardTitle>
            <CardDescription>These raw materials are below their minimum level.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {belowMin.map((r) => (
              <Badge key={r.id} variant="warning">
                {r.name}: {r.currentQty}{r.unit} (min {r.minLevel})
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Suppliers</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">Min / Par</TableHead>
                <TableHead className="text-right">Avg cost</TableHead>
                <TableHead className="text-right">Worth</TableHead>
                <TableHead className="w-40 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => {
                const tone = r.currentQty < r.minLevel ? "destructive" : r.currentQty < r.parLevel ? "warning" : "success";
                const covered = r.rmSuppliers.length > 0;
                const primary = r.rmSuppliers.find((rs) => rs.isPrimary) ?? r.rmSuppliers[0] ?? null;
                return (
                  <TableRow
                    key={r.id}
                    className={covered ? "bg-emerald-50/40 hover:bg-emerald-50/70" : ""}
                  >
                    <TableCell>
                      <RmDialog
                        suppliers={supplierOptions}
                        categories={categories}
                        subCategoriesByCategory={subCategoriesByCategory}
                        initial={{
                          id: r.id,
                          name: r.name,
                          unit: r.unit,
                          parLevel: r.parLevel,
                          minLevel: r.minLevel,
                          currentQty: r.currentQty,
                          avgCost: r.avgCost,
                          supplierId: r.supplierId ?? "",
                          categoryName: r.categoryName ?? "",
                          subCategory: r.subCategory ?? "",
                        }}
                      >
                        <button className="font-medium hover:underline text-left">{r.name}</button>
                      </RmDialog>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.categoryName ? (
                        <div>
                          <div className="font-medium">{r.categoryName}</div>
                          {r.subCategory && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {r.subCategory}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {covered ? (
                        <ManageRmSuppliersDialog
                          rawMaterialId={r.id}
                          rawMaterialName={r.name}
                          rawMaterialUnit={r.unit}
                          suppliers={supplierOptions}
                          initialEntries={r.rmSuppliers.map((rs) => ({
                            supplierId: rs.supplierId,
                            negotiatedRate: rs.negotiatedRate,
                            isPrimary: rs.isPrimary,
                          }))}
                        >
                          <button className="text-xs text-left hover:underline">
                            <div className="font-medium">
                              {primary?.supplier.name}{" "}
                              {primary && (
                                <span className="text-muted-foreground tabular-nums">
                                  · ₹{primary.negotiatedRate}/{r.unit}
                                </span>
                              )}
                            </div>
                            {r.rmSuppliers.length > 1 && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                +{r.rmSuppliers.length - 1} more vendor
                                {r.rmSuppliers.length - 1 === 1 ? "" : "s"}
                              </div>
                            )}
                          </button>
                        </ManageRmSuppliersDialog>
                      ) : (
                        <ManageRmSuppliersDialog
                          rawMaterialId={r.id}
                          rawMaterialName={r.name}
                          rawMaterialUnit={r.unit}
                          suppliers={supplierOptions}
                          initialEntries={[]}
                        >
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-medium text-amber-900 hover:bg-amber-100 transition-colors"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Assign supplier
                          </button>
                        </ManageRmSuppliersDialog>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={tone as any}>
                        {r.currentQty} {r.unit}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {r.minLevel} / {r.parLevel} {r.unit}
                    </TableCell>
                    <TableCell className="text-right">{inr(r.avgCost)}/{r.unit}</TableCell>
                    <TableCell className="text-right font-medium">{inr(r.currentQty * r.avgCost)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <ManageRmSuppliersDialog
                          rawMaterialId={r.id}
                          rawMaterialName={r.name}
                          rawMaterialUnit={r.unit}
                          suppliers={supplierOptions}
                          initialEntries={r.rmSuppliers.map((rs) => ({
                            supplierId: rs.supplierId,
                            negotiatedRate: rs.negotiatedRate,
                            isPrimary: rs.isPrimary,
                          }))}
                        >
                          <Button variant="ghost" size="sm" title="Manage suppliers + rates">
                            <Users className="h-3.5 w-3.5" />
                          </Button>
                        </ManageRmSuppliersDialog>
                        <StockAdjust id={r.id} unit={r.unit} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                    {hasAnyFilter
                      ? "No items match the current filters."
                      : "No raw materials yet."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value, icon, tone = "neutral" }: { label: string; value: string; icon: React.ReactNode; tone?: "neutral" | "warn" }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={`text-2xl font-semibold mt-1 ${tone === "warn" ? "text-amber-600" : ""}`}>{value}</div>
        </div>
        <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center text-muted-foreground">{icon}</div>
      </CardContent>
    </Card>
  );
}
