import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Empty } from "@/components/ui/empty";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { Check, X, ChevronRight, RefreshCw, Truck, Phone, MapPin, Hash } from "lucide-react";
import { advanceOnlineOrder, rejectOnlineOrder } from "./actions";

export const dynamic = "force-dynamic";

const PLATFORM_BADGE: Record<string, { label: string; className: string }> = {
  SWIGGY: { label: "Swiggy", className: "bg-orange-100 text-orange-800 border-orange-300" },
  ZOMATO: { label: "Zomato", className: "bg-red-100 text-red-800 border-red-300" },
  MAGICPIN: { label: "Magicpin", className: "bg-purple-100 text-purple-800 border-purple-300" },
  DOTPE: { label: "Dotpe", className: "bg-blue-100 text-blue-800 border-blue-300" },
};

function ageMin(d: Date) {
  return Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
}

export default async function OnlineOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string }>;
}) {
  const sp = await searchParams;
  const outlet = await getActiveOutlet();

  const where: any = {
    outletId: outlet.id,
    channel: { in: ["SWIGGY", "ZOMATO", "MAGICPIN", "DOTPE"] },
  };
  if (sp.platform && sp.platform !== "all") where.channel = sp.platform;

  const orders = await db.order.findMany({
    where,
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const counts = {
    PLACED: orders.filter((o) => o.status === "PLACED").length,
    ACCEPTED: orders.filter((o) => o.status === "ACCEPTED").length,
    FOOD_READY: orders.filter((o) => o.status === "FOOD_READY").length,
    PICKED_UP: orders.filter((o) => o.status === "PICKED_UP" || o.status === "DELIVERED").length,
    REJECTED: orders.filter((o) => o.status === "REJECTED" || o.status === "CANCELLED").length,
  };

  return (
    <div>
      <PageHeader
        title="Online orders"
        description={`Normalized inbox across Swiggy, Zomato, Magicpin, Dotpe · ${orders.length} orders`}
        actions={
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Kpi label="New" value={counts.PLACED} tone="amber" />
        <Kpi label="Accepted" value={counts.ACCEPTED} tone="sky" />
        <Kpi label="Food ready" value={counts.FOOD_READY} tone="emerald" />
        <Kpi label="Picked up" value={counts.PICKED_UP} />
        <Kpi label="Rejected" value={counts.REJECTED} tone="rose" />
      </div>

      <Tabs defaultValue={sp.platform ?? "all"}>
        <TabsList>
          <TabsTrigger value="all" asChild>
            <a href="/orders/online">All</a>
          </TabsTrigger>
          <TabsTrigger value="SWIGGY" asChild>
            <a href="/orders/online?platform=SWIGGY">Swiggy</a>
          </TabsTrigger>
          <TabsTrigger value="ZOMATO" asChild>
            <a href="/orders/online?platform=ZOMATO">Zomato</a>
          </TabsTrigger>
          <TabsTrigger value="MAGICPIN" asChild>
            <a href="/orders/online?platform=MAGICPIN">Magicpin</a>
          </TabsTrigger>
          <TabsTrigger value="DOTPE" asChild>
            <a href="/orders/online?platform=DOTPE">Dotpe</a>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={sp.platform ?? "all"}>
          {orders.length === 0 ? (
            <Card>
              <CardContent>
                <Empty
                  title="No online orders"
                  desc="When aggregators send orders, they show up here as a normalized inbox."
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {orders.map((o) => {
                const plat = PLATFORM_BADGE[o.channel] ?? { label: o.channel, className: "" };
                const age = ageMin(o.createdAt);
                const stale = age >= 10 && o.status === "PLACED";
                return (
                  <Card key={o.id} className={stale ? "border-rose-300" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className={plat.className}>
                          {plat.label}
                        </Badge>
                        <StatusBadge status={o.status} />
                      </div>

                      <div className="font-mono text-xs text-muted-foreground mb-2">
                        <span className="inline-flex items-center gap-1">
                          <Hash className="h-3 w-3" />
                          {o.aggregatorOrderId ?? o.invoiceNo}
                        </span>
                      </div>

                      <ul className="text-sm space-y-0.5 mb-3 border-t pt-2">
                        {o.items.map((l) => (
                          <li key={l.id} className="flex justify-between">
                            <span>{l.name}</span>
                            <span className="text-muted-foreground">×{l.qty}</span>
                          </li>
                        ))}
                      </ul>

                      {o.deliveryAddress && (
                        <div className="text-xs text-muted-foreground flex items-start gap-1.5 mb-1">
                          <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                          {o.deliveryAddress}
                        </div>
                      )}

                      {o.riderName && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
                          <Truck className="h-3 w-3" />
                          {o.riderName}
                          {o.riderPhone && (
                            <>
                              <Phone className="h-3 w-3 ml-2" />
                              {o.riderPhone}
                            </>
                          )}
                          {o.deliveryOtp && (
                            <span className="ml-auto font-mono font-semibold text-foreground">OTP {o.deliveryOtp}</span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-3 border-t mt-3">
                        <div>
                          <div className="font-semibold">{inr(o.grandTotal)}</div>
                          <div className="text-[10px] text-muted-foreground">{age}m ago</div>
                        </div>

                        {o.status === "PLACED" && (
                          <div className="flex gap-1">
                            <form action={rejectOnlineOrder}>
                              <input type="hidden" name="id" value={o.id} />
                              <Button type="submit" size="sm" variant="outline">
                                <X className="h-3.5 w-3.5" />
                                Reject
                              </Button>
                            </form>
                            <form action={advanceOnlineOrder}>
                              <input type="hidden" name="id" value={o.id} />
                              <Button type="submit" size="sm">
                                <Check className="h-3.5 w-3.5" />
                                Accept
                              </Button>
                            </form>
                          </div>
                        )}

                        {(o.status === "ACCEPTED" || o.status === "FOOD_READY" || o.status === "PICKED_UP") && (
                          <form action={advanceOnlineOrder}>
                            <input type="hidden" name="id" value={o.id} />
                            <Button type="submit" size="sm">
                              {o.status === "ACCEPTED" && "Mark ready"}
                              {o.status === "FOOD_READY" && "Mark picked up"}
                              {o.status === "PICKED_UP" && "Mark delivered"}
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          </form>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: any }> = {
    PLACED: { label: "New", variant: "warning" },
    ACCEPTED: { label: "Accepted", variant: "info" },
    FOOD_READY: { label: "Food ready", variant: "success" },
    PICKED_UP: { label: "Picked up", variant: "secondary" },
    DELIVERED: { label: "Delivered", variant: "secondary" },
    REJECTED: { label: "Rejected", variant: "destructive" },
    CANCELLED: { label: "Cancelled", variant: "destructive" },
  };
  const m = map[status] ?? { label: status, variant: "secondary" };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  const colors: Record<string, string> = {
    amber: "text-amber-700",
    sky: "text-sky-700",
    emerald: "text-emerald-700",
    rose: "text-rose-700",
  };
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold mt-0.5 ${tone ? colors[tone] : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
