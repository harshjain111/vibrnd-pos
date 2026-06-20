import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Boxes, TrendingDown, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { AvailableRow, FavouriteToggle } from "./client";

export const dynamic = "force-dynamic";

export default async function AvailableStockPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  const sp = await searchParams;
  const outlet = await getActiveOutlet();
  const rms = await db.rawMaterial.findMany({
    where: {
      outletId: outlet.id,
      active: true,
      ...(sp.q ? { name: { contains: sp.q, mode: "insensitive" as const } } : {}),
      ...(sp.cat ? { categoryName: sp.cat } : {}),
    },
    orderBy: [{ isFavourite: "desc" }, { name: "asc" }],
  });
  const total = rms.reduce((s, r) => s + r.currentQty * (r.avgCost || r.purchasePrice || 0), 0);
  const belowMin = rms.filter((r) => r.currentQty < r.minLevel).length;
  const belowPar = rms.filter((r) => r.currentQty < r.parLevel && r.currentQty >= r.minLevel).length;

  return (
    <div>
      <PageHeader
        title="Available Stock"
        description={`${rms.length} raw material${rms.length === 1 ? "" : "s"} · ${inr(Math.round(total))} on-hand value`}
      />

      <StatGrid cols={3} className="mb-4">
        <StatCard label="Total value" value={inr(Math.round(total))} icon={<Boxes className="h-4 w-4" />} />
        <StatCard label="Below par" value={belowPar} tone={belowPar > 0 ? "warn" : "neutral"} icon={<TrendingDown className="h-4 w-4" />} />
        <StatCard label="Below min" value={belowMin} tone={belowMin > 0 ? "bad" : "neutral"} icon={<AlertTriangle className="h-4 w-4" />} />
      </StatGrid>

      {rms.length === 0 ? (
        <Card><CardContent><Empty title="No raw materials yet" desc="Create one in Inventory · Masters · Raw Materials." /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">★</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Raw Material</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead className="text-right">Update qty</TableHead>
                  <TableHead>Comments</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rms.map((r) => {
                  const status =
                    r.currentQty < r.minLevel ? "min" : r.currentQty < r.parLevel ? "par" : "ok";
                  return (
                    <TableRow key={r.id}>
                      <TableCell><FavouriteToggle id={r.id} isFav={r.isFavourite} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.categoryName ?? "—"}</TableCell>
                      <TableCell>
                        <div className="font-medium">{r.name}</div>
                        {r.brand && <div className="text-[10px] text-muted-foreground">{r.brand}</div>}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-semibold">{r.currentQty}</span>
                        <span className="text-xs text-muted-foreground ml-1">{r.consumptionUnit || r.unit}</span>
                      </TableCell>
                      <TableCell>
                        {status === "min" ? (
                          <Badge variant="destructive" className="text-[10px]">Below min</Badge>
                        ) : status === "par" ? (
                          <Badge variant="warning" className="text-[10px]">Below par</Badge>
                        ) : (
                          <Badge variant="success" className="text-[10px]">OK</Badge>
                        )}
                      </TableCell>
                      <AvailableRow id={r.id} currentQty={r.currentQty} unit={r.consumptionUnit || r.unit} />
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
