import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { Plus, Trash2 } from "lucide-react";
import { SubTypeDialog } from "./client";
import { deleteSubType } from "./actions";

export const dynamic = "force-dynamic";

const PARENT_TONE: Record<string, "info" | "success" | "warning"> = {
  DINE_IN: "info",
  PICKUP: "success",
  DELIVERY: "warning",
};

export default async function SubTypesPage() {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const types = await db.subOrderType.findMany({
    where: { outletId: outlet.id },
    orderBy: [{ parentType: "asc" }, { rank: "asc" }],
  });

  return (
    <div>
      <PageHeader
        title="Sub-order types"
        description="Optional fine-grain channels under Dine-in / Pickup / Delivery (e.g. AC, Bar, Parcel, Late-night)."
        actions={
          <SubTypeDialog>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add type
            </Button>
          </SubTypeDialog>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead className="text-right">Rank</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-12">
                    No sub-types yet.
                  </TableCell>
                </TableRow>
              ) : (
                types.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      <Badge variant={PARENT_TONE[t.parentType] ?? "secondary"}>{t.parentType.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{t.rank}</TableCell>
                    <TableCell>{t.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <SubTypeDialog
                          initial={{ id: t.id, name: t.name, parentType: t.parentType as any, rank: t.rank, active: t.active }}
                        >
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        </SubTypeDialog>
                        <form action={deleteSubType}>
                          <input type="hidden" name="id" value={t.id} />
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
