import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import { InlineAlert } from "@/components/ui/inline-alert";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { AlertTriangle, ClipboardList, CheckCircle2, Plus, Truck } from "lucide-react";
import { SupplierDialog } from "../client";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const outlet = await getActiveOutlet();
  const [suppliers, rms] = await Promise.all([
    db.supplier.findMany({
      include: { _count: { select: { rmSuppliers: true } } },
      orderBy: { name: "asc" },
    }),
    db.rawMaterial.findMany({
      where: { outletId: outlet.id, active: true },
      select: { id: true, name: true, unit: true, rmSuppliers: { select: { id: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  // Coverage analysis: how many raw materials have at least one supplier
  // assigned via the rate card? Surfaces the gap before a frantic late-night
  // PO realizes no vendor was ever picked.
  const uncovered = rms.filter((r) => r.rmSuppliers.length === 0);
  const covered = rms.length - uncovered.length;
  const coveragePct =
    rms.length === 0 ? 100 : Math.round((covered / rms.length) * 100);

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description={`${suppliers.length} suppliers · ${covered}/${rms.length} raw materials covered (${coveragePct}%)`}
        actions={
          <SupplierDialog>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Supplier
            </Button>
          </SupplierDialog>
        }
      />

      {/* Coverage strip — green when 100%, amber when there's a gap. */}
      {rms.length > 0 && (
        <InlineAlert
          tone={uncovered.length === 0 ? "good" : "warn"}
          icon={uncovered.length === 0 ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          title={
            uncovered.length === 0
              ? "Every item is covered"
              : `${uncovered.length} item${uncovered.length === 1 ? "" : "s"} need a supplier`
          }
          className="mb-4"
        >
          {uncovered.length === 0
            ? "Every raw material is on at least one supplier's rate card. POs will auto-suggest the primary vendor."
            : "These items have no supplier on file. Assign one from the raw materials page so PO builders find them on the right rate card."}
          {uncovered.length > 0 && (
            <>
              <div className="flex flex-wrap gap-1.5 mt-2 mb-3">
                {uncovered.slice(0, 12).map((r) => (
                  <Badge key={r.id} variant="warning" className="text-[10px] font-normal">
                    {r.name}
                  </Badge>
                ))}
                {uncovered.length > 12 && (
                  <Badge variant="outline" className="text-[10px]">
                    +{uncovered.length - 12} more
                  </Badge>
                )}
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/inventory?filter=uncovered">Go assign suppliers</Link>
              </Button>
            </>
          )}
        </InlineAlert>
      )}

      <Card>
        <CardContent className="p-0">
          {suppliers.length === 0 ? (
            <Empty icon={Truck} title="No suppliers yet" desc="Add your first supplier to start building rate cards and raising POs." />
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
