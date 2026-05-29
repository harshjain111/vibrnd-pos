import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { PoBuilder } from "./client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NewPOPage() {
  const outlet = await getActiveOutlet();
  const [suppliers, rms] = await Promise.all([
    db.supplier.findMany({ orderBy: { name: "asc" } }),
    db.rawMaterial.findMany({ where: { outletId: outlet.id }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="New purchase order"
        description="Order raw materials from a supplier. Stock updates when you mark it received."
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/inventory/purchase">
              <ArrowLeft className="h-4 w-4" />
              All POs
            </Link>
          </Button>
        }
      />
      <PoBuilder
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        rms={rms.map((r) => ({
          id: r.id,
          name: r.name,
          unit: r.unit,
          avgCost: r.avgCost,
          parLevel: r.parLevel,
          currentQty: r.currentQty,
        }))}
      />
    </div>
  );
}
