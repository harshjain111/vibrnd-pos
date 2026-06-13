import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ArrowLeft, ArrowRight, FileText, Truck } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { inr } from "@/lib/utils";
import { NewGrnForm } from "./client";

export const dynamic = "force-dynamic";

const PO_STATUS_LABEL: Record<string, string> = {
  SENT: "Sent",
  PARTIALLY_RECEIVED: "Partial GRN",
  APPROVED: "Approved",
};

export default async function NewGrnPage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string; adhoc?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const outlet = await getActiveOutlet();
  const adhoc = sp.adhoc === "1";

  /* ── Step 1: no PO picked and not explicit ad-hoc → show the picker ── */
  if (!sp.po && !adhoc) {
    const eligiblePos = await db.purchaseOrder.findMany({
      where: {
        outletId: outlet.id,
        status: { in: ["APPROVED", "SENT", "PARTIALLY_RECEIVED"] },
      },
      include: {
        supplier: { select: { name: true } },
        lines: true,
        _count: { select: { grns: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return (
      <div>
        <PageHeader
          title="New goods received note"
          description="Pick the PO this shipment is against — line items, expected qty, and unit cost are filled in automatically. Or log an emergency ad-hoc receipt."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/inventory/grn">
                <ArrowLeft className="h-4 w-4" />
                All GRNs
              </Link>
            </Button>
          }
        />

        <Card className="mb-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Step 1 — Link to a Purchase Order</CardTitle>
            <CardDescription>
              GRN = source of truth for stock arriving from a supplier. Picking the PO
              auto-loads its line items so you only fill the qty actually received +
              any damages.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="mb-3">
          <CardContent className="p-0">
            {eligiblePos.length === 0 ? (
              <Empty
                title="No POs ready to receive"
                desc="Raise + approve + send a PO from /inventory/purchase first, or log an ad-hoc receipt below."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Lines</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eligiblePos.map((po) => {
                    const remaining = po.lines.reduce(
                      (s, l) => s + Math.max(0, l.qty - l.qtyReceived),
                      0
                    );
                    return (
                      <TableRow key={po.id} className="hover:bg-accent/40">
                        <TableCell>
                          <Link
                            href={`/inventory/grn/new?po=${po.id}`}
                            className="font-mono text-xs hover:underline"
                          >
                            {po.poNo}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {po.createdAt.toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-sm">{po.supplier.name}</TableCell>
                        <TableCell className="text-right text-sm">
                          {po.lines.length}
                          {po._count.grns > 0 && (
                            <span className="text-[10px] text-muted-foreground ml-1">
                              ({po._count.grns} GRN{po._count.grns === 1 ? "" : "s"})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {inr(Math.round(po.grandTotal))}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={po.status === "PARTIALLY_RECEIVED" ? "warning" : "info"}
                            className="text-[10px]"
                          >
                            {PO_STATUS_LABEL[po.status] ?? po.status}
                          </Badge>
                          {remaining > 0 && po.status === "PARTIALLY_RECEIVED" && (
                            <div className="text-[10px] text-amber-700 mt-0.5">
                              {remaining.toFixed(2)} pending
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/inventory/grn/new?po=${po.id}`}>
                              Receive
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Ad-hoc escape hatch */}
        <Card className="border-amber-300 bg-amber-50/40">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-amber-900">No PO — emergency receipt</div>
              <div className="text-sm text-amber-800 mt-1">
                Use this only when stock arrives outside the normal PO flow (e.g. ran out
                of tomatoes mid-service and ran to the bazaar). Your manager will be
                notified so the audit trail is clear.
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/inventory/grn/new?adhoc=1">
                Log ad-hoc receipt
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ── Step 2: PO picked (or explicit ad-hoc) → show the form ── */
  const po = sp.po
    ? await db.purchaseOrder.findFirst({
        where: { id: sp.po, outletId: outlet.id },
        include: {
          supplier: true,
          lines: { include: { rawMaterial: true } },
        },
      })
    : null;

  if (sp.po && !po) {
    return (
      <div>
        <PageHeader title="PO not found" description="The PO might have been cancelled or doesn't belong to this outlet." />
        <Button asChild variant="outline">
          <Link href="/inventory/grn/new">
            <ArrowLeft className="h-4 w-4" /> Pick another PO
          </Link>
        </Button>
      </div>
    );
  }

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
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/inventory/grn/new">
              <ArrowLeft className="h-4 w-4" />
              Change PO
            </Link>
          </Button>
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

      {po && (
        <Card className="mb-3 border-sky-300 bg-sky-50/40">
          <CardContent className="p-3 flex items-start gap-2">
            <FileText className="h-4 w-4 text-sky-700 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-sky-900 text-sm">
                Linked to {po.poNo}
              </div>
              <div className="text-sm text-sky-800 mt-0.5">
                Vendor: {po.supplier.name}. Line items + expected quantities pre-filled below.
                Edit the "Receiving" column to match what physically arrived.
              </div>
            </div>
            <Link
              href={`/inventory/purchase/${po.id}`}
              target="_blank"
              rel="noopener"
              className="text-xs text-sky-700 underline-offset-2 hover:underline"
              title="Opens in a new tab so this GRN form keeps everything you've typed"
            >
              View PO ↗
            </Link>
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
