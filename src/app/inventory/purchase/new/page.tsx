/**
 * New Purchase Order — single entry point per spec section 2.
 *
 * Flow: SM clicks "New PO" → adds one line item at a time. For each item
 * the picker surfaces current stock + min/par + the supplier list with
 * rate-card prices, so the SM picks the best supplier per item. On submit
 * the server groups by supplier and creates one DRAFT PO per supplier in
 * a single transaction; all share a batchKey so the list view banners
 * them together.
 *
 * Optional ?req=<id> pre-fills the cart from a requisition's shortfall —
 * carried over from the legacy flow so the "Raise PO" button on a
 * requisition still lands here.
 */
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { getSessionUser } from "@/lib/session";
import { stockAtDepartment } from "@/lib/stock";
import { rmDepartmentFilter } from "@/lib/department-scope";
import { NewPoClient } from "./client";

export const dynamic = "force-dynamic";

export default async function NewPOPage({
  searchParams,
}: {
  searchParams: Promise<{ req?: string }>;
}) {
  const sp = await searchParams;
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const deptScope = user ? rmDepartmentFilter(user.role) : null;

  const [rms, suppliers] = await Promise.all([
    db.rawMaterial.findMany({
      where: { outletId: outlet.id, active: true, ...(deptScope ?? {}) },
      include: {
        rmSuppliers: {
          include: { supplier: { select: { id: true, name: true } } },
          orderBy: { negotiatedRate: "asc" },
        },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.supplier.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Optional pre-fill — when a requisition is short, the SM clicks
  // "Raise PO" on the requisition and lands here. Pre-fill the cart
  // with the shortfall lines so they're not retyping.
  let prefillLines: { rawMaterialId: string; qty: number }[] = [];
  let linkedReq: { id: string; reqNo: string; fromDeptName: string } | null = null;
  if (sp.req) {
    const req = await db.requisition.findFirst({
      where: { id: sp.req, outletId: outlet.id },
      include: {
        fromDepartment: { select: { name: true } },
        toDepartment: { select: { id: true } },
        lines: { include: { rawMaterial: true } },
      },
    });
    if (req) {
      linkedReq = { id: req.id, reqNo: req.reqNo, fromDeptName: req.fromDepartment.name };
      const needed = (l: (typeof req.lines)[number]) =>
        req.status === "NEW" ? l.qtyRequested : l.qtyApproved;
      for (const l of req.lines) {
        const want = needed(l);
        if (want <= 0) continue;
        const onHand = await stockAtDepartment(l.rawMaterialId, req.toDepartmentId);
        const short = Math.max(0, want - onHand);
        if (short <= 0) continue;
        prefillLines.push({
          rawMaterialId: l.rawMaterialId,
          qty: Math.ceil(short * 100) / 100,
        });
      }
    }
  }

  const items = rms.map((rm) => {
    const ratedById = new Map<string, { supplierId: string; supplierName: string; ratePerUnit: number }>();
    for (const rs of rm.rmSuppliers) {
      ratedById.set(rs.supplier.id, {
        supplierId: rs.supplier.id,
        supplierName: rs.supplier.name,
        ratePerUnit: rs.negotiatedRate,
      });
    }
    return {
      id: rm.id,
      name: rm.name,
      unit: rm.purchaseUnit || rm.unit,
      categoryName: rm.categoryName,
      currentQty: rm.currentQty,
      minLevel: rm.minLevel,
      parLevel: rm.parLevel,
      avgCost: rm.avgCost,
      purchasePrice: rm.purchasePrice,
      ratedSuppliers: Array.from(ratedById.values()),
      defaultSupplierId: rm.supplierId ?? rm.rmSuppliers[0]?.supplier.id ?? null,
    };
  });

  return (
    <div>
      <PageHeader
        title="New purchase order"
        description={
          linkedReq
            ? `Covering shortfall from ${linkedReq.reqNo} · ${linkedReq.fromDeptName}`
            : "Add items, pick a supplier per item, and the system splits the order into one PO per supplier."
        }
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href={linkedReq ? `/inventory/requisitions/${linkedReq.id}` : "/inventory/purchase"}>
              <ArrowLeft className="h-4 w-4" />
              {linkedReq ? "Back to requisition" : "All POs"}
            </Link>
          </Button>
        }
      />
      {linkedReq && (
        <Card className="mb-3 border-sky-300 bg-sky-50/40">
          <CardContent className="p-3 flex items-start gap-2">
            <ClipboardList className="h-4 w-4 text-sky-700 mt-0.5 shrink-0" />
            <div className="flex-1 text-sm">
              <div className="font-semibold text-sky-900">Linked to {linkedReq.reqNo}</div>
              <div className="text-sky-800 mt-0.5">
                {prefillLines.length > 0
                  ? `Pre-filled with ${prefillLines.length} item(s) where store stock falls short. Pick a supplier and tweak quantities below.`
                  : "Every requested item is already in stock — no shortfall to cover. You can still raise a PO manually."}
              </div>
            </div>
            <Link
              href={`/inventory/requisitions/${linkedReq.id}`}
              className="text-xs text-sky-700 underline-offset-2 hover:underline shrink-0"
            >
              View requisition →
            </Link>
          </CardContent>
        </Card>
      )}
      <NewPoClient items={items} suppliers={suppliers} prefillLines={prefillLines} />
    </div>
  );
}
