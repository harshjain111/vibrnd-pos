import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { Plus, Sparkles } from "lucide-react";
import { UnitDialog, DeleteUnitBtn, SeedDefaultsBtn } from "./client";

export const dynamic = "force-dynamic";

export default async function UnitsPage() {
  const outlet = await getActiveOutlet();
  const units = await db.unit.findMany({
    where: { outletId: outlet.id },
    orderBy: { name: "asc" },
  });
  return (
    <div>
      <PageHeader
        title="Units"
        description="Units of measurement used for purchase, transfer, recipe and consumption."
        actions={
          <>
            {units.length === 0 && (
              <SeedDefaultsBtn>
                <Button variant="outline" size="sm">
                  <Sparkles className="h-4 w-4" />
                  Seed defaults
                </Button>
              </SeedDefaultsBtn>
            )}
            <UnitDialog>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Unit
              </Button>
            </UnitDialog>
          </>
        }
      />
      {units.length === 0 ? (
        <Card>
          <CardContent>
            <Empty title="No units yet" desc="Tap Seed defaults to add the 21 most-common units (kg, g, ltr, BOX, …)." />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Base unit</TableHead>
                  <TableHead className="text-right">Conversion factor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.baseUnit ?? "—"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{u.conversionFactor}</TableCell>
                    <TableCell>
                      {u.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <UnitDialog initial={{ id: u.id, name: u.name, baseUnit: u.baseUnit ?? "", conversionFactor: u.conversionFactor }}>
                          <Button variant="ghost" size="sm">Edit</Button>
                        </UnitDialog>
                        <DeleteUnitBtn id={u.id} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
