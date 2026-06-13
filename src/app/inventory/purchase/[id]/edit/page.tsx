import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { PoBuilder } from "../../new/client";

export const dynamic = "force-dynamic";

export default async function EditPOPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const outlet = await getActiveOutlet();

  const po = await db.purchaseOrder.findFirst({
    where: { id, outletId: outlet.id },
    include: {
      supplier: true,
      lines: { include: { rawMaterial: { select: { name: true, unit: true } } } },
    },
  });
  if (!po) return notFound();

  // Only DRAFT POs are editable. Once submitted, the form sends the user
  // back to the detail page where status-appropriate actions live.
  if (po.status !== "DRAFT") {
    return (
      <div>
        <PageHeader
          title={`Cannot edit ${po.poNo}`}
          description={`PO is currently ${po.status} — only DRAFT purchase orders can be revised.`}
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href={`/inventory/purchase/${po.id}`}>
                <ArrowLeft className="h-4 w-4" />
                Back to PO
              </Link>
            </Button>
          }
        />
        <Card className="border-amber-300 bg-amber-50/40">
          <CardContent className="p-4 flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-900">
              To revise this PO you'll need to cancel it and raise a new one (or, if
              it's awaiting CC approval, ask the Cost Controller to reject so it
              returns to a state you can act on).
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [suppliers, rms] = await Promise.all([
    db.supplier.findMany({
      where: { active: true },
      include: {
        rmSuppliers: { select: { rawMaterialId: true, negotiatedRate: true, isPrimary: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.rawMaterial.findMany({ where: { outletId: outlet.id }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title={`Edit ${po.poNo}`}
        description={`Draft revision — add or remove items, change quantities or prices, then save or submit.`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href={`/inventory/purchase/${po.id}`}>
              <ArrowLeft className="h-4 w-4" />
              Back to PO
            </Link>
          </Button>
        }
      />
      <PoBuilder
        suppliers={suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          creditDays: s.creditDays,
          rateCard: s.rmSuppliers.map((rm) => ({
            rawMaterialId: rm.rawMaterialId,
            negotiatedRate: rm.negotiatedRate,
            isPrimary: rm.isPrimary,
          })),
        }))}
        rms={rms.map((r) => ({
          id: r.id,
          name: r.name,
          unit: r.unit,
          avgCost: r.avgCost,
          parLevel: r.parLevel,
          currentQty: r.currentQty,
        }))}
        initialSupplierId={po.supplierId}
        initialNotes={po.notes ?? ""}
        initialLines={po.lines.map((l) => ({
          rawMaterialId: l.rawMaterialId,
          qty: l.qty,
          unit: l.unit,
          unitPrice: l.unitPrice,
        }))}
        editingPoId={po.id}
        editingPoNo={po.poNo}
      />
    </div>
  );
}
