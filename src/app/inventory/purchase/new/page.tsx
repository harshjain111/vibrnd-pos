import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { stockAtDepartment } from "@/lib/stock";
import { PoBuilder } from "./client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ClipboardList } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NewPOPage({
  searchParams,
}: {
  searchParams: Promise<{ req?: string }>;
}) {
  const sp = await searchParams;
  const outlet = await getActiveOutlet();
  // Load suppliers WITH their rate cards in one shot so the client can
  // switch supplier without round-tripping. Rate-card map drives both the
  // item picker (filtered to card items) and the auto-fill rate.
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

  // When ?req=<id> is set the SM is converting a requisition shortfall into
  // a PO. Load the req, find the STORE dept, and prefill lines with the
  // shortfall qty (approved − on-hand at store). Lines already covered fully
  // are skipped so the SM doesn't need to clean them up.
  let prefillLines: { rawMaterialId: string; qty: number; unit: string; unitPrice: number }[] = [];
  let linkedReq: { id: string; reqNo: string; status: string; fromDeptName: string } | null = null;
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
      linkedReq = {
        id: req.id,
        reqNo: req.reqNo,
        status: req.status,
        fromDeptName: req.fromDepartment.name,
      };
      // Use qtyApproved for already-reviewed reqs, qtyRequested for NEW ones.
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
          unit: l.unit,
          unitPrice: l.rawMaterial.avgCost || 0,
        });
      }
    }
  }

  return (
    <div>
      <PageHeader
        title="New purchase order"
        description={
          linkedReq
            ? `Covering shortfall from ${linkedReq.reqNo} · ${linkedReq.fromDeptName}`
            : "Order raw materials from a supplier. Stock updates when you mark it received."
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
              <div className="font-semibold text-sky-900">
                Linked to {linkedReq.reqNo}
              </div>
              <div className="text-sky-800 mt-0.5">
                {prefillLines.length > 0
                  ? `Pre-filled with ${prefillLines.length} item(s) where store stock falls short of the approved qty. Pick a supplier and adjust quantities below.`
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
        initialLines={prefillLines}
        requisitionId={linkedReq?.id ?? null}
      />
    </div>
  );
}
