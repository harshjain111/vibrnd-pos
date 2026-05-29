import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { getActiveOutlet } from "@/lib/outlet";
import { Plus } from "lucide-react";
import { NewOutletDialog, SwitchOutletButton, DeactivateOutletButton } from "./client";

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
                <TableHead>GSTIN</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outlets.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">
                    {o.name}
                    {o.id === active.id && <span className="text-xs text-muted-foreground ml-2">· active</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{o.code}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{o.gstin ?? "—"}</TableCell>
                  <TableCell className="text-right">{o._count.orders}</TableCell>
                  <TableCell className="text-right">{o._count.items}</TableCell>
                  <TableCell className="text-right">{o._count.users}</TableCell>
                  <TableCell>
                    {o.storeOpen ? <Badge variant="success">Open</Badge> : <Badge variant="destructive">Closed</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <SwitchOutletButton id={o.id} active={o.id === active.id} />
                      <DeactivateOutletButton id={o.id} name={o.name} disabled={outlets.length <= 1} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
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
