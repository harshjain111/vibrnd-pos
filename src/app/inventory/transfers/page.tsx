import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import { StatusBadge } from "@/components/ui/status-badge";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { stockAtDepartment } from "@/lib/stock";
import { fmtDate } from "@/lib/utils";
import { ArrowLeftRight, Layers, Send } from "lucide-react";
import { NewTransferDialog, ReceiveBtn, PendingRequisitions, CombinedTransferDialog } from "./client";

export const dynamic = "force-dynamic";

type TabKey = "pending" | "transit" | "received" | "all";

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: TabKey }>;
}) {
  const sp = await searchParams;
  const tab: TabKey = (["pending", "transit", "received", "all"] as TabKey[]).includes(sp.tab as TabKey)
    ? (sp.tab as TabKey)
    : "pending";
  const outlet = await getActiveOutlet();

  const ownStore = await db.department.findFirst({
    where: { outletId: outlet.id, kind: "STORE", active: true },
  });
  const eligibleReqs = await db.requisition.findMany({
    where: {
      status: { in: ["APPROVED", "PARTIAL"] },
      transfer: null,
      OR: [{ outletId: outlet.id }, ...(ownStore ? [{ toDepartmentId: ownStore.id }] : [])],
    },
    include: {
      outlet: { select: { name: true } },
      fromDepartment: { select: { id: true, name: true, outletId: true } },
      toDepartment: { select: { name: true, outletId: true } },
      lines: { include: { rawMaterial: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const [transfers, otherOutlets, rms, units, deptRows] = await Promise.all([
    db.transfer.findMany({
      where: { OR: [{ senderOutletId: outlet.id }, { receiverOutletId: outlet.id }] },
      include: { sender: true, receiver: true, lines: { include: { rawMaterial: true } } },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    db.outlet.findMany({ where: { id: { not: outlet.id }, active: true }, orderBy: { name: "asc" } }),
    db.rawMaterial.findMany({ where: { outletId: outlet.id, active: true }, orderBy: { name: "asc" } }),
    db.unit.findMany({ where: { outletId: outlet.id, active: true }, orderBy: { name: "asc" } }),
    db.department.findMany({
      where: { outletId: outlet.id, active: true, NOT: { kind: "STORE" } },
      orderBy: { kind: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // Internal requisitions (raised at this outlet, dept → own STORE) become
  // actionable pending transfers, with per-line store availability.
  const internalReqs = eligibleReqs.filter((r) => r.fromDepartment.outletId === r.toDepartment.outletId);
  const pendingReqs = await Promise.all(
    internalReqs.map(async (r) => {
      const lines = await Promise.all(
        r.lines
          .filter((l) => l.qtyApproved > 0)
          .map(async (l) => ({
            rawMaterialId: l.rawMaterialId,
            name: l.rawMaterial.name,
            unit: l.unit,
            approved: l.qtyApproved,
            available: Number((await stockAtDepartment(l.rawMaterialId, r.toDepartmentId)).toFixed(2)),
          }))
      );
      return {
        id: r.id,
        reqNo: r.reqNo,
        requesterDeptId: r.fromDepartment.id,
        requesterDeptName: r.fromDepartment.name,
        lines,
        hasShortfall: lines.some((l) => l.available < l.approved),
        canTransfer: lines.some((l) => l.available > 0),
      };
    })
  );

  // Store on-hand items for the "add extra item" pickers.
  const storeItems = ownStore
    ? (
        await Promise.all(
          rms.map(async (r) => ({
            id: r.id,
            name: r.name,
            unit: r.consumptionUnit ?? r.unit,
            available: Number((await stockAtDepartment(r.id, ownStore.id)).toFixed(2)),
          }))
        )
      ).filter((s) => s.available > 0)
    : [];

  // Status tabs + filtered transfer list.
  const sentCount = transfers.filter((t) => t.status === "SENT").length;
  const receivedCount = transfers.filter((t) => t.status === "RECEIVED").length;
  const filteredTransfers =
    tab === "transit"
      ? transfers.filter((t) => t.status === "SENT")
      : tab === "received"
        ? transfers.filter((t) => t.status === "RECEIVED")
        : tab === "all"
          ? transfers
          : []; // pending tab shows the requisition section instead

  const tabs = [
    { key: "pending", label: "Pending requests", count: pendingReqs.length },
    { key: "transit", label: "In transit", count: sentCount },
    { key: "received", label: "Received", count: receivedCount },
    { key: "all", label: "All transfers", count: transfers.length },
  ];

  return (
    <div>
      <PageHeader
        title="Stock Transfers"
        description="Dispatch approved requisitions to departments. Store stock drops on dispatch; the department's stock rises when it raises a GRN."
        actions={
          <>
            {otherOutlets.length > 0 && (
              <NewTransferDialog
                outlets={otherOutlets.map((o) => ({ id: o.id, name: o.name }))}
                rawMaterials={rms.map((r) => ({ id: r.id, name: r.name, unit: r.purchaseUnit ?? r.unit, price: r.transferPrice || r.purchasePrice || r.avgCost }))}
                units={units.map((u) => u.name)}
                requisitions={eligibleReqs
                  .filter((r) => r.fromDepartment.outletId !== r.toDepartment.outletId)
                  .map((r) => ({
                    id: r.id,
                    reqNo: r.reqNo,
                    kind: "CHAIN" as const,
                    requesterOutletId: r.fromDepartment.outletId,
                    requesterOutletName: r.outlet.name,
                    requesterDeptName: r.fromDepartment.name,
                    lines: r.lines
                      .filter((l) => l.qtyApproved > 0)
                      .map((l) => ({ rawMaterialId: l.rawMaterialId, rawMaterialName: l.rawMaterial.name, qty: l.qtyApproved, unit: l.unit })),
                  }))}
              >
                <Button size="sm" variant="outline"><Send className="h-4 w-4" />Send to outlet</Button>
              </NewTransferDialog>
            )}
            <CombinedTransferDialog requisitions={pendingReqs} storeItems={storeItems} departments={deptRows}>
              <Button size="sm"><Layers className="h-4 w-4" />New transfer</Button>
            </CombinedTransferDialog>
          </>
        }
      />

      <FilterTabs
        className="mb-4"
        basePath="/inventory/transfers"
        current={tab}
        defaultKey="pending"
        items={tabs}
      />

      {tab === "pending" ? (
        <PendingRequisitions requisitions={pendingReqs} storeItems={storeItems} />
      ) : filteredTransfers.length === 0 ? (
        <Card>
          <CardContent>
            <Empty icon={ArrowLeftRight} title="Nothing here" desc="No transfers match this filter." />
          </CardContent>
        </Card>
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
                {filteredTransfers.map((t) => {
                  const incoming = t.receiverOutletId === outlet.id && t.status === "SENT";
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(t.transferDate)}</TableCell>
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
