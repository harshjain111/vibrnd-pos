import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { stockAtDepartment } from "@/lib/stock";
import { fmtDate } from "@/lib/utils";
import { ArrowLeftRight, Plus } from "lucide-react";
import { NewTransferDialog, ReceiveBtn, PendingRequisitions } from "./client";

export const dynamic = "force-dynamic";

export default async function TransfersPage() {
  const outlet = await getActiveOutlet();
  // Approved/partial requisitions this outlet can SUPPLY: either internal
  // (raised at this outlet, dept→own STORE) or inbound chain (raised at a
  // child outlet, supplier dept is this outlet's STORE — i.e. this is a
  // BS/BK acting). Used to prefill the transfer dialog so the SM doesn't
  // have to re-key lines.
  const ownStore = await db.department.findFirst({
    where: { outletId: outlet.id, kind: "STORE", active: true },
  });
  const eligibleReqs = await db.requisition.findMany({
    where: {
      status: { in: ["APPROVED", "PARTIAL"] },
      transfer: null,
      OR: [
        { outletId: outlet.id },
        ...(ownStore ? [{ toDepartmentId: ownStore.id }] : []),
      ],
    },
    include: {
      outlet: { select: { name: true } },
      fromDepartment: { select: { name: true, outletId: true } },
      toDepartment: { select: { name: true, outletId: true } },
      lines: { include: { rawMaterial: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const [transfers, otherOutlets, rms, units] = await Promise.all([
    db.transfer.findMany({
      where: { OR: [{ senderOutletId: outlet.id }, { receiverOutletId: outlet.id }] },
      include: { sender: true, receiver: true, lines: { include: { rawMaterial: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.outlet.findMany({ where: { id: { not: outlet.id }, active: true }, orderBy: { name: "asc" } }),
    db.rawMaterial.findMany({ where: { outletId: outlet.id, active: true }, orderBy: { name: "asc" } }),
    db.unit.findMany({ where: { outletId: outlet.id, active: true }, orderBy: { name: "asc" } }),
  ]);

  // Internal requisitions (raised at this outlet, dept → own STORE) become
  // actionable "pending transfers" the SM dispatches from here — constrained
  // to what the store actually holds. Compute per-line availability so the
  // SM sees the shortfall before transferring.
  const internalReqs = eligibleReqs.filter(
    (r) => r.fromDepartment.outletId === r.toDepartment.outletId
  );
  const pendingReqs = await Promise.all(
    internalReqs.map(async (r) => {
      const lines = await Promise.all(
        r.lines
          .filter((l) => l.qtyApproved > 0)
          .map(async (l) => ({
            name: l.rawMaterial.name,
            unit: l.unit,
            approved: l.qtyApproved,
            available: Number((await stockAtDepartment(l.rawMaterialId, r.toDepartmentId)).toFixed(2)),
          }))
      );
      return {
        id: r.id,
        reqNo: r.reqNo,
        requesterDeptName: r.fromDepartment.name,
        lines,
        hasShortfall: lines.some((l) => l.available < l.approved),
        canTransfer: lines.some((l) => l.available > 0),
      };
    })
  );

  return (
    <div>
      <PageHeader
        title="Stock Transfers"
        description="Two-step transfers between outlets. Sender stock decrements on save; receiver stock increments on confirm."
        actions={
          <NewTransferDialog
            outlets={otherOutlets.map((o) => ({ id: o.id, name: o.name }))}
            rawMaterials={rms.map((r) => ({ id: r.id, name: r.name, unit: r.purchaseUnit ?? r.unit, price: r.transferPrice || r.purchasePrice || r.avgCost }))}
            units={units.map((u) => u.name)}
            requisitions={eligibleReqs.map((r) => {
              const isCrossOutlet = r.fromDepartment.outletId !== r.toDepartment.outletId;
              return {
                id: r.id,
                reqNo: r.reqNo,
                kind: isCrossOutlet ? ("CHAIN" as const) : ("INTERNAL" as const),
                requesterOutletId: r.fromDepartment.outletId,
                requesterOutletName: r.outlet.name,
                requesterDeptName: r.fromDepartment.name,
                lines: r.lines
                  .filter((l) => l.qtyApproved > 0)
                  .map((l) => ({
                    rawMaterialId: l.rawMaterialId,
                    rawMaterialName: l.rawMaterial.name,
                    qty: l.qtyApproved,
                    unit: l.unit,
                  })),
              };
            })}
          >
            <Button size="sm"><Plus className="h-4 w-4" />New transfer</Button>
          </NewTransferDialog>
        }
      />

      <PendingRequisitions requisitions={pendingReqs} />

      {transfers.length === 0 ? (
        <Card><CardContent><Empty icon={ArrowLeftRight} title="No transfers yet" desc="Tap New transfer to send raw material to another outlet." /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Challan</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((t) => {
                  const incoming = t.receiverOutletId === outlet.id && t.status === "SENT";
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtDate(t.transferDate)}
                      </TableCell>
                      <TableCell className="font-medium">{t.sender.name}</TableCell>
                      <TableCell className="font-medium">{t.receiver.name}</TableCell>
                      <TableCell className="text-xs font-mono">{t.challanNo ?? t.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{t.lines.length}</TableCell>
                      <TableCell>
                        <StatusBadge kind="transfer" status={t.status} className="text-[10px]" />
                      </TableCell>
                      <TableCell className="text-right">
                        {incoming && (
                          <ReceiveBtn
                            transferId={t.id}
                            lines={t.lines.map((l) => ({ id: l.id, name: l.rawMaterial.name, qtySent: l.qtySent, unit: l.unit }))}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
