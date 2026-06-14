import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { Plus, Users, UtensilsCrossed } from "lucide-react";
import { TableGroupDialog, DeleteTableGroupBtn } from "./client";

export const dynamic = "force-dynamic";

export default async function TableGroupsPage() {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();

  const [groups, captains, tables] = await Promise.all([
    db.tableGroup.findMany({
      where: { outletId: outlet.id },
      include: {
        captain: { select: { id: true, name: true } },
        tables: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.user.findMany({
      where: { outletId: outlet.id, active: true, role: "CAPTAIN" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.diningTable.findMany({
      where: { outletId: outlet.id, active: true },
      select: { id: true, name: true, tableGroupId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const ungroupedCount = tables.filter((t) => !t.tableGroupId).length;

  return (
    <div>
      <PageHeader
        title="Table groups"
        description={`${groups.length} group${groups.length === 1 ? "" : "s"} · ${ungroupedCount} ungrouped table${ungroupedCount === 1 ? "" : "s"}`}
        actions={
          <TableGroupDialog
            captains={captains}
            tables={tables.map((t) => ({ id: t.id, name: t.name, currentGroupId: t.tableGroupId }))}
          >
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New group
            </Button>
          </TableGroupDialog>
        }
      />

      <Card className="mb-4 border-sky-300 bg-sky-50/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-sky-900 flex items-center gap-2">
            <Users className="h-4 w-4" />
            How table groups work
          </CardTitle>
          <CardDescription className="text-sky-800">
            Bundle a set of tables under a captain (e.g. "Aarav owns the patio"). When the
            receptionist seats a guest at one of those tables, the captain is auto-attributed —
            no captain dropdown needed.
          </CardDescription>
        </CardHeader>
      </Card>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No table groups yet. Create your first one to start auto-attributing tables to captains.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {groups.map((g) => (
            <Card key={g.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{g.name}</CardTitle>
                    <CardDescription className="mt-0.5">
                      {g.captain ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Badge variant="secondary" className="text-[10px]">CAPTAIN</Badge>
                          {g.captain.name}
                        </span>
                      ) : (
                        <span className="text-amber-700">No captain — order won't auto-attribute</span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <TableGroupDialog
                      captains={captains}
                      tables={tables.map((t) => ({ id: t.id, name: t.name, currentGroupId: t.tableGroupId }))}
                      initial={{
                        id: g.id,
                        name: g.name,
                        captainId: g.captain?.id ?? "",
                        tableIds: g.tables.map((t) => t.id),
                      }}
                    >
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    </TableGroupDialog>
                    <DeleteTableGroupBtn id={g.id} name={g.name} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="text-xs text-muted-foreground mb-1 inline-flex items-center gap-1">
                  <UtensilsCrossed className="h-3 w-3" />
                  {g.tables.length} table{g.tables.length === 1 ? "" : "s"}
                </div>
                <div className="flex flex-wrap gap-1">
                  {g.tables.map((t) => (
                    <Badge key={t.id} variant="outline" className="text-[11px]">
                      {t.name}
                    </Badge>
                  ))}
                  {g.tables.length === 0 && (
                    <span className="text-xs italic text-muted-foreground">No tables assigned</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
