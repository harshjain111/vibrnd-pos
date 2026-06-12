import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { NewGrnForm } from "./client";

export const dynamic = "force-dynamic";

export default async function NewGrnPage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const outlet = await getActiveOutlet();

  const po = sp.po
    ? await db.purchaseOrder.findFirst({
        where: { id: sp.po, outletId: outlet.id },
        include: {
          supplier: true,
          lines: { include: { rawMaterial: true } },
        },
      })
    : null;

  const allRms = po
    ? []
    : await db.rawMaterial.findMany({
        where: { outletId: outlet.id, active: true },
        select: { id: true, name: true, unit: true, avgCost: true },
        orderBy: { name: "asc" },
      });

  const isAdHoc = !po;

  return (
    <div>
      <PageHeader
        title={po ? `Receive against ${po.poNo}` : "Ad-hoc receipt"}
        description={
          po
            ? `From ${po.supplier.name} — expected ${po.lines.length} line(s)`
            : "Stock arrived without a PO (emergency / local purchase). Manager will be notified."
        }
      />

      {isAdHoc && (
        <Card className="mb-3 border-amber-300 bg-amber-50/50">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-amber-900 text-sm">No PO — ad-hoc receipt</div>
              <div className="text-sm text-amber-800 mt-0.5">
                This is for emergency local purchases (e.g. ran out of tomatoes mid-service).
                A notification fires to the manager when you save so the audit trail is loud.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <NewGrnForm
            poId={po?.id ?? null}
            poLines={
              po
                ? po.lines.map((l) => ({
                    id: l.id,
                    rawMaterialId: l.rawMaterialId,
                    name: l.rawMaterial.name,
                    unit: l.unit,
                    qtyOrdered: l.qty,
                    qtyAlreadyReceived: l.qtyReceived,
                    unitPrice: l.unitPrice,
                  }))
                : []
            }
            rawMaterials={allRms.map((r) => ({
              id: r.id,
              name: r.name,
              unit: r.unit,
              avgCost: r.avgCost,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
