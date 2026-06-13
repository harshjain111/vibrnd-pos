import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { RateCardEditor } from "./client";

export const dynamic = "force-dynamic";

export default async function SupplierRateCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const outlet = await getActiveOutlet();

  const supplier = await db.supplier.findUnique({
    where: { id },
    include: {
      rmSuppliers: {
        include: { rawMaterial: { select: { id: true, name: true, unit: true } } },
      },
    },
  });
  if (!supplier) return notFound();

  const rms = await db.rawMaterial.findMany({
    where: { outletId: outlet.id, active: true },
    select: { id: true, name: true, unit: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title={`Rate card · ${supplier.name}`}
        description="Items this vendor supplies + the negotiated rate. POs raised against this supplier will only offer these items by default."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/inventory/suppliers">
              <ArrowLeft className="h-4 w-4" />
              All suppliers
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4">
          <RateCardEditor
            supplierId={supplier.id}
            initialCreditDays={supplier.creditDays}
            rawMaterials={rms}
            initialLines={supplier.rmSuppliers.map((r) => ({
              rawMaterialId: r.rawMaterialId,
              negotiatedRate: r.negotiatedRate,
              isPrimary: r.isPrimary,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
