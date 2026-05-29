import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { OrderEditor } from "./client";

export const dynamic = "force-dynamic";

export default async function OrderEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("MANAGER");
  const { id } = await params;
  const outlet = await getActiveOutlet();
  const order = await db.order.findFirst({
    where: { id, outletId: outlet.id },
    include: { items: true },
  });
  if (!order) return notFound();
  if (order.status === "CANCELLED") {
    return (
      <div>
        <PageHeader title={`Edit ${order.invoiceNo}`} description="Cancelled orders cannot be modified." />
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            This order is CANCELLED. Reopen it from the detail page first.
          </CardContent>
        </Card>
      </div>
    );
  }

  const items = await db.item.findMany({
    where: { outletId: outlet.id, active: true },
    include: { variants: { orderBy: { rank: "asc" } }, addons: { orderBy: { rank: "asc" } }, category: true },
    orderBy: [{ category: { rank: "asc" } }, { name: "asc" }],
  });

  return (
    <div>
      <PageHeader
        title={`Edit ${order.invoiceNo}`}
        description={`${order.orderType.replace("_", " ")} · current total ${inr(order.grandTotal)} · ${order.items.length} lines`}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/orders/${order.id}`}>
              <ArrowLeft className="h-4 w-4" />
              Back to order
            </Link>
          </Button>
        }
      />

      <Card className="mb-4 border-amber-300 bg-amber-50/40">
        <CardHeader>
          <CardTitle className="text-amber-900 text-sm">Modifying a settled bill</CardTitle>
          <CardDescription>
            Every change requires a reason and is recorded on the audit trail. Use this only for legitimate corrections — added items go to the kitchen as a new KOT marked AMENDMENT.
          </CardDescription>
        </CardHeader>
      </Card>

      <OrderEditor
        orderId={order.id}
        invoiceNo={order.invoiceNo}
        existingLines={order.items.map((li) => ({
          id: li.id,
          name: li.name,
          qty: li.qty,
          price: li.price,
        }))}
        catalog={items.map((i) => ({
          id: i.id,
          name: i.name,
          price: i.price,
          categoryName: i.category.name,
          isVeg: i.isVeg,
          variants: i.variants.map((v) => ({ id: v.id, name: v.name, price: v.price })),
          addons: i.addons.map((a) => ({ id: a.id, name: a.name, priceDelta: a.priceDelta })),
        }))}
      />
    </div>
  );
}
