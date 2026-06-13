import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { getActiveOutlet } from "@/lib/outlet";
import { Plus } from "lucide-react";
import { AddUserDialog, EditUserDialog, ResetPasswordDialog, DeleteUserButton, SeedTestUsersButton } from "./client";

export const dynamic = "force-dynamic";

const ROLE_TONE: Record<string, "default" | "info" | "secondary" | "warning"> = {
  OWNER: "default",
  MANAGER: "info",
  BILLER: "secondary",
  CAPTAIN: "warning",
};

export default async function UsersPage() {
  const me = await requireUser("OWNER");
  const outlet = await getActiveOutlet();
  const users = await db.user.findMany({
    where: { outletId: outlet.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Users & permissions"
        description={`${users.length} user${users.length === 1 ? "" : "s"} · OWNER role required to manage`}
        actions={
          <>
            <SeedTestUsersButton />
            <AddUserDialog>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Invite user
              </Button>
            </AddUserDialog>
          </>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right w-44">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.name}
                    {u.id === me.id && <span className="text-xs text-muted-foreground ml-1">· you</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={ROLE_TONE[u.role] ?? "secondary"}>{u.role}</Badge>
                  </TableCell>
                  <TableCell>{u.active ? <Badge variant="success">Active</Badge> : <Badge variant="destructive">Inactive</Badge>}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <EditUserDialog
                        initial={{ id: u.id, name: u.name, role: u.role as any, active: u.active, commissionRate: u.commissionRate }}
                      >
                        <Button variant="ghost" size="sm">
                          Edit
                        </Button>
                      </EditUserDialog>
                      <ResetPasswordDialog id={u.id} email={u.email} />
                      <DeleteUserButton id={u.id} email={u.email} disabled={u.id === me.id} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-4 text-xs text-muted-foreground space-y-1">
        <div>
          <strong>Front of house:</strong> OWNER → MANAGER → BILLER (cashier) → CAPTAIN / RECEPTIONIST.
          Receptionist owns the floor plan + customer register; captain punches orders + KOTs;
          cashier handles moves / splits / comp; manager additionally voids.
        </div>
        <div>
          <strong>Inventory / Procurement:</strong> Store Manager, Cost Controller, HODs (Chef / Bartender / Housekeeping),
          Accountant, Production Manager — gated per page, not by hierarchy.
        </div>
      </div>
    </div>
  );
}
