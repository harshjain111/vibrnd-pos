import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { Plus } from "lucide-react";
import { SupplierDialog } from "../client";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const suppliers = await db.supplier.findMany({
    include: { _count: { select: { rawMaterials: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description={`${suppliers.length} suppliers · linked to raw material masters`}
        actions={
          <SupplierDialog>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Supplier
            </Button>
          </SupplierDialog>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.contact ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{s.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{s.gstin ?? "—"}</TableCell>
                  <TableCell className="text-right">{s._count.rawMaterials}</TableCell>
                  <TableCell className="text-right">
                    <SupplierDialog
                      initial={{
                        id: s.id,
                        name: s.name,
                        contact: s.contact ?? undefined,
                        phone: s.phone ?? undefined,
                        gstin: s.gstin ?? undefined,
                        address: s.address ?? undefined,
                      }}
                    >
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    </SupplierDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
