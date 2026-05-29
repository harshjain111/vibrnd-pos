import Link from "next/link";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { inr } from "@/lib/utils";
import { Users } from "lucide-react";

export async function FloorPlan({ outletId }: { outletId: string }) {
  const tables = await db.diningTable.findMany({
    where: { outletId },
    include: {
      orders: {
        where: { status: { in: ["RUNNING", "SAVED", "PRINTED"] } },
        include: { items: true, kots: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  const active = tables.filter((t) => t.orders.length > 0);
  const estRevenue = active.reduce((s, t) => s + (t.orders[0]?.grandTotal ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="Total tables" value={String(tables.length)} />
        <Stat label="Active tables" value={String(active.length)} />
        <Stat label="Est. revenue" value={inr(estRevenue)} />
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {tables.map((t) => {
            const order = t.orders[0];
            const status = order
              ? order.kots.some((k) => k.status === "READY")
                ? "READY"
                : order.status === "PRINTED"
                ? "BILL"
                : "OCCUPIED"
              : "FREE";
            return (
              <Link key={t.id} href={order ? `/orders?q=${order.invoiceNo}` : "/billing"} className="block">
                <div
                  className={`rounded-xl border-2 p-3 h-28 flex flex-col items-center justify-center transition-all ${
                    {
                      FREE: "bg-emerald-50 border-emerald-200 hover:border-emerald-400",
                      OCCUPIED: "bg-amber-50 border-amber-300 hover:border-amber-500",
                      READY: "bg-sky-50 border-sky-300 hover:border-sky-500",
                      BILL: "bg-rose-50 border-rose-300 hover:border-rose-500",
                    }[status]
                  }`}
                >
                  <div className="font-bold text-lg">{t.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {t.capacity}
                  </div>
                  {order && (
                    <div className="text-xs font-semibold mt-1">{inr(order.grandTotal)}</div>
                  )}
                  <div className="text-[10px] uppercase tracking-wider mt-1 text-muted-foreground">
                    {status === "FREE" ? "Free" : status === "OCCUPIED" ? "Occupied" : status === "READY" ? "Food ready" : "Bill printed"}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t text-xs text-muted-foreground">
          <Legend color="bg-emerald-200" label="Free" />
          <Legend color="bg-amber-300" label="Occupied" />
          <Legend color="bg-sky-300" label="Food ready" />
          <Legend color="bg-rose-300" label="Bill printed" />
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded ${color}`} />
      {label}
    </span>
  );
}
