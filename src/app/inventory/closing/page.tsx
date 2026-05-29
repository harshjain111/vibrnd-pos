import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { ClosingGrid } from "./client";

export const dynamic = "force-dynamic";

function midnight(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }

export default async function ClosingStockPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const outlet = await getActiveOutlet();
  const day = midnight(sp.date ? new Date(sp.date) : new Date());

  const rms = await db.rawMaterial.findMany({
    where: { outletId: outlet.id, active: true },
    orderBy: [{ isFavourite: "desc" }, { name: "asc" }],
  });

  const header = await db.stockCount.findUnique({
    where: { outletId_businessDay_countType: { outletId: outlet.id, businessDay: day, countType: "DAY_END" } },
    include: { lines: true },
  });

  const linesByRm = new Map(header?.lines.map((l) => [l.rawMaterialId, l]) ?? []);

  const rmLines = rms.map((r) => {
    const l = linesByRm.get(r.id);
    return {
      rawMaterialId: r.id,
      name: r.name,
      category: r.categoryName ?? "",
      unit: r.consumptionUnit ?? r.unit,
      expectedQty: r.currentQty,
      countedQty: l?.countedQty ?? r.currentQty,
      variance: l ? l.variance : 0,
      comments: l?.comments ?? "",
    };
  });

  return (
    <div>
      <PageHeader
        title={`Closing Stock (${day.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })})`}
        description="Day-end physical count. Save to record the snapshot, then Freeze to lock it (Owner-only unfreeze)."
      />
      <Card>
        <CardContent className="p-3">
          <ClosingGrid
            businessDay={day.toISOString()}
            frozen={header?.frozen ?? false}
            rmLines={rmLines}
          />
        </CardContent>
      </Card>
    </div>
  );
}
