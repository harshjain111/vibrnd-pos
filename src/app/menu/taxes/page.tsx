import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { Plus, Trash2 } from "lucide-react";
import { SlabDialog } from "./client";
import { deleteTaxSlab } from "./actions";

export const dynamic = "force-dynamic";

export default async function TaxMastersPage() {
  const outlet = await getActiveOutlet();
  const [slabs, items] = await Promise.all([
    db.taxSlab.findMany({ where: { outletId: outlet.id }, orderBy: { rate: "asc" } }),
    db.item.findMany({ where: { outletId: outlet.id }, select: { taxRate: true } }),
  ]);

  // Count items per rate
  const itemsByRate = items.reduce<Record<number, number>>((acc, it) => {
    acc[it.taxRate] = (acc[it.taxRate] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="Tax masters"
        description="GST slabs available for menu items. Items reference these rates."
        actions={
          <SlabDialog>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add slab
            </Button>
          </SlabDialog>
        }
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Why this matters</CardTitle>
          <CardDescription>
            Standardize the tax rates used across your menu. When CGST/SGST rules change, edit the slab once and re-apply to all items at that rate — no per-item editing.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Items at this rate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slabs.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-right font-semibold">{s.rate}%</TableCell>
                  <TableCell className="text-right text-muted-foreground">{itemsByRate[s.rate] ?? 0}</TableCell>
                  <TableCell>{s.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <SlabDialog
                        initial={{ id: s.id, name: s.name, rate: s.rate, active: s.active }}
                      >
                        <Button variant="ghost" size="sm">
                          Edit
                        </Button>
                      </SlabDialog>
                      <form action={deleteTaxSlab}>
                        <input type="hidden" name="id" value={s.id} />
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {slabs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    No tax slabs yet. Add at least one (GST 5% is the typical default for restaurants).
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
