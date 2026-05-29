import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { Plus } from "lucide-react";
import { NewTransferDialog, ReceiveBtn } from "./client";

export const dynamic = "force-dynamic";

export default async function TransfersPage() {
  const outlet = await getActiveOutlet();
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
          >
            <Button size="sm"><Plus className="h-4 w-4" />New transfer</Button>
          </NewTransferDialog>
        }
      />
      {transfers.length === 0 ? (
        <Card><CardContent><Empty title="No transfers yet" desc="Tap New transfer to send raw material to another outlet." /></CardContent></Card>
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
                        {t.transferDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                      </TableCell>
                      <TableCell className="font-medium">{t.sender.name}</TableCell>
                      <TableCell className="font-medium">{t.receiver.name}</TableCell>
                      <TableCell className="text-xs font-mono">{t.challanNo ?? t.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{t.lines.length}</TableCell>
                      <TableCell>
                        <Badge variant={t.status === "RECEIVED" ? "success" : t.status === "SENT" ? "warning" : "secondary"} className="text-[10px]">
                          {t.status}
                        </Badge>
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
