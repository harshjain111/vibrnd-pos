import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { ReturnForm } from "./client";

export const dynamic = "force-dynamic";

export default async function ReturnOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("MANAGER");
  const { id } = await params;
  const outlet = await getActiveOutlet();
  const order = await db.order.findFirst({
    where: { id, outletId: outlet.id },
    include: {
      items: true,
      returns: { include: { lines: true } },
    },
  });
  if (!order) return notFound();

  // Already returned qty per orderItemId
  const returnedMap = new Map<string, number>();
  for (const r of order.returns) {
    for (const l of r.lines) {
      if (!l.orderItemId) continue;
      returnedMap.set(l.orderItemId, (returnedMap.get(l.orderItemId) ?? 0) + l.qty);
    }
  }
  const totalReturned = order.returns.reduce((s, r) => s + r.amount, 0);

  return (
    <div>
      <PageHeader
        title={`Return — ${order.invoiceNo}`}
        description={`Settled ${inr(order.grandTotal)} · already returned ${inr(totalReturned)}`}
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
          <CardTitle className="text-amber-900 text-sm">Process a sales return</CardTitle>
          <CardDescription>
            Pick the items and qty being returned, choose refund mode, and capture a reason. Stock auto-reverses per recipe; the return shows on the order detail + audit trail.
          </CardDescription>
        </CardHeader>
      </Card>

      <ReturnForm
        orderId={order.id}
        lines={order.items.map((li) => ({
          id: li.id,
          name: li.name,
          qty: li.qty,
          alreadyReturned: returnedMap.get(li.id) ?? 0,
          price: li.price,
        }))}
      />

      {order.returns.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Prior returns ({order.returns.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm p-4 pt-0">
            {order.returns.map((r) => (
              <div key={r.id} className="border-b last:border-0 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">{r.returnNo}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="text-muted-foreground text-xs">{r.reason}</div>
                <div className="text-xs">
                  Refunded <strong>{inr(r.amount)}</strong> via {r.refundMode}
                </div>
                <ul className="text-xs text-muted-foreground mt-1">
                  {r.lines.map((l) => (
                    <li key={l.id}>
                      {l.name} × {l.qty} — {inr(l.lineTotal)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
