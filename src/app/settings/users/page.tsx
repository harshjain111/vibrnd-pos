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
import { ShieldCheck, ChefHat, ClipboardList, CreditCard } from "lucide-react";

// Matrix preview rows — kept in this server module so it can render
// inside the page.tsx server component. The same data shape is mirrored
// in client.tsx for the dropdown labels, but we don't import across the
// boundary because plain data exports from "use client" modules don't
// reach server components at runtime.
const ROLE_MATRIX_PREVIEW: Record<string, string[]> = {
  OWNER: ["Everything Manager can do", "Manage users + outlets + permissions"],
  MANAGER: [
    "Everything Cashier can do",
    "Void items (post-KOT) with reason",
    "Apply discounts at settle",
    "Comp / Complimentary orders",
    "Operations reports + override approvals",
  ],
  BILLER: [
    "Everything Captain can do",
    "Move tables · Shift items between tables",
    "Split bill · Change customer name",
    "Settle bill · Payment collection",
    "Cash drawer · Memberships",
  ],
  CAPTAIN: ["Punch orders", "Generate KOT", "View open tables", "Print bill"],
  RECEPTIONIST: [
    "Register customer + capture details",
    "Assign table from floor plan",
    "View open tables",
  ],
};

export const dynamic = "force-dynamic";

const ROLE_TONE: Record<string, "default" | "info" | "secondary" | "warning"> = {
  OWNER: "default",
  MANAGER: "info",
  BILLER: "secondary",
  CAPTAIN: "warning",
  RECEPTIONIST: "info",
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

      {/* POS Role Hierarchy — mirrors the "Role Hierarchy" box in the
          spec image. Renders the matrix rows added at each tier so an
          owner can sanity-check assignments against the access matrix
          without flipping to /settings/permissions. */}
      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">POS Role Hierarchy</h2>
            <span className="text-xs text-muted-foreground">Each tier inherits the row below it</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <RoleHierarchyTile
              tone="indigo"
              icon={<ShieldCheck className="h-4 w-4" />}
              title="MANAGER"
              caption="All Cashier rights + additional"
              rows={ROLE_MATRIX_PREVIEW.MANAGER}
            />
            <RoleHierarchyTile
              tone="rose"
              icon={<CreditCard className="h-4 w-4" />}
              title="CASHIER · BILLER"
              caption="All Captain rights + additional"
              rows={ROLE_MATRIX_PREVIEW.BILLER}
            />
            <RoleHierarchyTile
              tone="emerald"
              icon={<ClipboardList className="h-4 w-4" />}
              title="CAPTAIN"
              caption="Basic order punching"
              rows={ROLE_MATRIX_PREVIEW.CAPTAIN}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <RoleHierarchyTile
              tone="amber"
              icon={<ChefHat className="h-4 w-4" />}
              title="RECEPTIONIST"
              caption="Customer registration + Table allocation (Box 1)"
              rows={ROLE_MATRIX_PREVIEW.RECEPTIONIST}
            />
            <RoleHierarchyTile
              tone="slate"
              icon={<ShieldCheck className="h-4 w-4" />}
              title="OWNER"
              caption="Manager rights + user / outlet / permission management"
              rows={ROLE_MATRIX_PREVIEW.OWNER}
            />
          </div>
        </CardContent>
      </Card>

      <div className="mt-3 text-xs text-muted-foreground space-y-1">
        <div>
          <strong>Inventory / Procurement:</strong> Store Manager, Cost Controller, HODs (Chef / Bartender / Housekeeping),
          Accountant, Production Manager — gated per page, not by hierarchy. See <strong>Permissions</strong> for the full
          page-by-page matrix.
        </div>
      </div>
    </div>
  );
}

const TONE_CLASSES: Record<string, { border: string; bg: string; title: string }> = {
  indigo: { border: "border-indigo-300", bg: "bg-indigo-50/60", title: "text-indigo-900" },
  rose: { border: "border-rose-300", bg: "bg-rose-50/60", title: "text-rose-900" },
  emerald: { border: "border-emerald-300", bg: "bg-emerald-50/60", title: "text-emerald-900" },
  amber: { border: "border-amber-300", bg: "bg-amber-50/60", title: "text-amber-900" },
  slate: { border: "border-slate-300", bg: "bg-slate-50/60", title: "text-slate-900" },
};

function RoleHierarchyTile({
  tone,
  icon,
  title,
  caption,
  rows,
}: {
  tone: keyof typeof TONE_CLASSES;
  icon: React.ReactNode;
  title: string;
  caption: string;
  rows: string[];
}) {
  const t = TONE_CLASSES[tone];
  return (
    <div className={`rounded-md border ${t.border} ${t.bg} p-3`}>
      <div className={`flex items-center gap-2 font-semibold text-sm ${t.title}`}>
        {icon}
        {title}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{caption}</div>
      <ul className="mt-2 space-y-0.5 text-xs">
        {rows.map((r, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="text-emerald-600 leading-none mt-1">✓</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
