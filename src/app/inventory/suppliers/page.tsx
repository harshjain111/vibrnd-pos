import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { ClipboardList, Plus } from "lucide-react";
import { SupplierDialog } from "../client";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const suppliers = await db.supplier.findMany({
    include: { _count: { select: { rmSuppliers: true } } },
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
                <TableHead className="text-right">Rate card</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right w-44">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.contact ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{s.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{s.gstin ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {s._count.rmSuppliers > 0 ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {s._count.rmSuppliers} item{s._count.rmSuppliers === 1 ? "" : "s"}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">— not set</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {s.creditDays > 0 ? (
                      <span>
                        {s.creditDays}
                        <span className="text-[10px] text-muted-foreground ml-0.5">d</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">COD</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/inventory/suppliers/${s.id}/rate-card`}>
                          <ClipboardList className="h-3.5 w-3.5" />
                          Rate card
                        </Link>
                      </Button>
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
                    </div>
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
