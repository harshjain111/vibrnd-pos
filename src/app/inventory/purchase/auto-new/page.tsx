/**
 * Multi-supplier auto-PO picker — spec section 2.
 *
 * The SM sees every active raw material in one matrix with current stock,
 * min/par levels, suggested qty (par − stock), and a supplier picker
 * pre-populated with each RM's known suppliers + rate-card prices. They
 * tick items, set qty + supplier per row, and on submit the server
 * groups by supplier and creates one DRAFT PO per supplier. Lands them
 * back on /inventory/purchase with a banner listing the new drafts.
 */
import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { AutoPoClient } from "./client";
import { rmDepartmentFilter } from "@/lib/department-scope";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AutoPoPickerPage() {
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const deptScope = user ? rmDepartmentFilter(user.role) : null;

  const rms = await db.rawMaterial.findMany({
    where: { outletId: outlet.id, active: true, ...(deptScope ?? {}) },
    include: {
      rmSuppliers: {
        include: { supplier: { select: { id: true, name: true } } },
        orderBy: { negotiatedRate: "asc" },
      },
      supplier: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  // Suppliers as a fallback list when an RM has no rmSuppliers rows. The
  // picker still needs a complete supplier list so the SM can pick one
  // off-card if they need to. Same flow as /inventory/purchase/new.
  // (Supplier rows are chain-wide — not scoped to outlet.)
  const suppliers = await db.supplier.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const items = rms.map((rm) => {
    // Combine the per-RM rate-card with the legacy single-supplier link
    // so the picker shows everyone the SM might choose from. Dedupe by
    // supplier id, prefer the rate-card entry (it carries the rate).
    const ratedById = new Map<string, { supplierId: string; supplierName: string; ratePerUnit: number; onCard: true }>();
    for (const rs of rm.rmSuppliers) {
      ratedById.set(rs.supplier.id, {
        supplierId: rs.supplier.id,
        supplierName: rs.supplier.name,
        ratePerUnit: rs.negotiatedRate,
        onCard: true,
      });
    }
    const suggested = Math.max(0, rm.parLevel - rm.currentQty);
    const reorderTrigger = rm.currentQty < rm.minLevel;
    return {
      id: rm.id,
      name: rm.name,
      unit: rm.purchaseUnit || rm.unit,
      categoryName: rm.categoryName,
      currentQty: rm.currentQty,
      minLevel: rm.minLevel,
      parLevel: rm.parLevel,
      suggested,
      reorderTrigger,
      avgCost: rm.avgCost,
      purchasePrice: rm.purchasePrice,
      ratedSuppliers: Array.from(ratedById.values()),
      defaultSupplierId: rm.supplierId ?? rm.rmSuppliers[0]?.supplier.id ?? null,
    };
  });

  return (
    <div>
      <PageHeader
        title="Auto-create POs"
        description={`${outlet.name} · Pick items + suppliers; the server creates one PO per supplier.`}
      />
      <AutoPoClient items={items} suppliers={suppliers} />
    </div>
  );
}
