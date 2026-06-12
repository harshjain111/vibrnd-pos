import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { getActiveOutlet } from "@/lib/outlet";
import { Plus } from "lucide-react";
import { NewOutletDialog, SwitchOutletButton, DeactivateOutletButton, TopologyButton } from "./client";

export const dynamic = "force-dynamic";

export default async function OutletsPage() {
  await requireUser("OWNER");
  const active = await getActiveOutlet();
  const outlets = await db.outlet.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { orders: true, items: true, users: true } },
    },
  });
  const baseStores = outlets.filter((o) => (o as any).kind === "BASE_STORE").map((o) => ({ id: o.id, name: o.name }));
  const baseKitchens = outlets.filter((o) => (o as any).kind === "BASE_KITCHEN").map((o) => ({ id: o.id, name: o.name }));
  const outletById = new Map(outlets.map((o) => [o.id, o.name]));

  const KIND_BADGE: Record<string, { variant: any; label: string }> = {
    OUTLET: { variant: "secondary", label: "Outlet" },
    BASE_STORE: { variant: "info", label: "Base Store" },
    BASE_KITCHEN: { variant: "warning", label: "Base Kitchen" },
  };

  return (
    <div>
      <PageHeader
        title="Outlets"
        description={`${outlets.length} active outlet${outlets.length === 1 ? "" : "s"} · OWNER role`}
        actions={
          <NewOutletDialog>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New outlet
            </Button>
          </NewOutletDialog>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Supplies from</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-44">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outlets.map((o) => {
                const kind = (o as any).kind ?? "OUTLET";
                const kindCfg = KIND_BADGE[kind] ?? KIND_BADGE.OUTLET;
                const bsId = (o as any).baseStoreOutletId as string | null;
                const bkId = (o as any).baseKitchenOutletId as string | null;
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">
                      {o.name}
                      {o.id === active.id && <span className="text-xs text-muted-foreground ml-2">· active</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{o.code}</TableCell>
                    <TableCell>
                      <Badge variant={kindCfg.variant} className="text-[10px]">
                        {kindCfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {kind === "OUTLET" ? (
                        <>
                          {bsId && <div>BS: {outletById.get(bsId) ?? "—"}</div>}
                          {bkId && <div>BK: {outletById.get(bkId) ?? "—"}</div>}
                          {!bsId && !bkId && "Direct from suppliers"}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">{o._count.orders}</TableCell>
                    <TableCell className="text-right">{o._count.users}</TableCell>
                    <TableCell>
                      {o.storeOpen ? <Badge variant="success">Open</Badge> : <Badge variant="destructive">Closed</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <TopologyButton
                          outletId={o.id}
                          outletName={o.name}
                          currentKind={kind}
                          currentBaseStoreId={bsId}
                          currentBaseKitchenId={bkId}
                          availableBaseStores={baseStores.filter((b) => b.id !== o.id)}
                          availableBaseKitchens={baseKitchens.filter((b) => b.id !== o.id)}
                        />
                        <SwitchOutletButton id={o.id} active={o.id === active.id} />
                        <DeactivateOutletButton id={o.id} name={o.name} disabled={outlets.length <= 1} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-4 text-xs text-muted-foreground">
        Outlets are isolated — switching the active outlet scopes every screen (orders, menu, inventory, customers, reports) to it.
      </div>
    </div>
  );
}
