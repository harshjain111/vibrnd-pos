import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import { DiscountDialog } from "./client";
import { deleteDiscount } from "./actions";

export const dynamic = "force-dynamic";

export default async function DiscountsPage() {
  const outlet = await getActiveOutlet();
  const discounts = await db.discount.findMany({
    where: { outletId: outlet.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Discounts & coupons"
        description={`${discounts.length} configured · enter a code at checkout to apply`}
        actions={
          <DiscountDialog>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add discount
            </Button>
          </DiscountDialog>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Min order</TableHead>
                <TableHead className="text-right">Max off</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {discounts.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono font-semibold">{d.code}</TableCell>
                  <TableCell>{d.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{d.type}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {d.type === "PERCENT" ? `${d.value}%` : d.type === "FLAT" ? inr(d.value) : "50% (BOGO)"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{d.minOrder ? inr(d.minOrder) : "—"}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{d.maxDiscount ? inr(d.maxDiscount) : "—"}</TableCell>
                  <TableCell>{d.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <DiscountDialog
                        initial={{
                          id: d.id,
                          code: d.code,
                          name: d.name,
                          type: d.type as any,
                          value: d.value,
                          minOrder: d.minOrder,
                          maxDiscount: d.maxDiscount ?? undefined,
                          active: d.active,
                        }}
                      >
                        <Button variant="ghost" size="sm">
                          Edit
                        </Button>
                      </DiscountDialog>
                      <form action={deleteDiscount}>
                        <input type="hidden" name="id" value={d.id} />
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {discounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                    No discounts yet. Add a percentage, flat amount, or BOGO offer.
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
