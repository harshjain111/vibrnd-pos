import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { NewPurchaseForm } from "./client";

export const dynamic = "force-dynamic";

export default async function NewPurchasePage() {
  const outlet = await getActiveOutlet();
  const [suppliers, rms, units, pos] = await Promise.all([
    db.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.rawMaterial.findMany({ where: { outletId: outlet.id, active: true }, orderBy: { name: "asc" } }),
    db.unit.findMany({ where: { outletId: outlet.id, active: true }, orderBy: { name: "asc" } }),
    db.purchaseOrder.findMany({ where: { outletId: outlet.id, status: { in: ["DRAFT", "SENT"] } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  return (
    <div>
      <PageHeader title="New Stock Purchase" description="Capture a vendor invoice — lines, GST split, batch+expiry, payment." />
      <NewPurchaseForm
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, gstin: s.gstin ?? null }))}
        rawMaterials={rms.map((r) => ({
          id: r.id,
          name: r.name,
          unit: r.purchaseUnit || r.unit,
          price: r.purchasePrice || r.avgCost || 0,
          taxPct: r.taxPct || 0,
        }))}
        units={units.map((u) => u.name)}
        purchaseOrders={pos.map((p) => ({ id: p.id, poNo: p.poNo }))}
      />
    </div>
  );
}
