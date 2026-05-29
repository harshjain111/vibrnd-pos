import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { Plus, AlertTriangle, Boxes } from "lucide-react";
import { RmDialog, StockAdjust } from "./client";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const outlet = await getActiveOutlet();
  const [rms, suppliers] = await Promise.all([
    db.rawMaterial.findMany({ where: { outletId: outlet.id }, include: { supplier: true }, orderBy: { name: "asc" } }),
    db.supplier.findMany({ orderBy: { name: "asc" } }),
  ]);

  const stockWorth = rms.reduce((s, r) => s + r.avgCost * r.currentQty, 0);
  const belowMin = rms.filter((r) => r.currentQty < r.minLevel);
  const belowPar = rms.filter((r) => r.currentQty >= r.minLevel && r.currentQty < r.parLevel);

  return (
    <div>
      <PageHeader
        title="Raw materials"
        description="Inventory master with current stock, par/min levels, and supplier link"
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
            <RmDialog suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}>
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
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">Min / Par</TableHead>
                <TableHead className="text-right">Avg cost</TableHead>
                <TableHead className="text-right">Worth</TableHead>
                <TableHead className="w-40 text-right">Adjust</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rms.map((r) => {
                const tone = r.currentQty < r.minLevel ? "destructive" : r.currentQty < r.parLevel ? "warning" : "success";
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <RmDialog
                        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
                        initial={{
                          id: r.id,
                          name: r.name,
                          unit: r.unit,
                          parLevel: r.parLevel,
                          minLevel: r.minLevel,
                          currentQty: r.currentQty,
                          avgCost: r.avgCost,
                          supplierId: r.supplierId ?? "",
                        }}
                      >
                        <button className="font-medium hover:underline text-left">{r.name}</button>
                      </RmDialog>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.supplier?.name ?? "—"}</TableCell>
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
                      <StockAdjust id={r.id} unit={r.unit} />
                    </TableCell>
                  </TableRow>
                );
              })}
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
