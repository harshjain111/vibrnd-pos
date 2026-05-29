import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { Search, Receipt, UtensilsCrossed, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const outlet = await getActiveOutlet();

  const empty = q.length < 2;

  const [orders, items, customers] = empty
    ? [[], [], []]
    : await Promise.all([
        db.order.findMany({
          where: {
            outletId: outlet.id,
            OR: [{ invoiceNo: { contains: q, mode: "insensitive" } }, { aggregatorOrderId: { contains: q, mode: "insensitive" } }],
          },
          include: { customer: true },
          orderBy: { createdAt: "desc" },
          take: 15,
        }),
        db.item.findMany({
          where: {
            outletId: outlet.id,
            OR: [{ name: { contains: q, mode: "insensitive" } }, { shortCode: { contains: q, mode: "insensitive" } }],
          },
          include: { category: true },
          orderBy: { name: "asc" },
          take: 15,
        }),
        db.customer.findMany({
          where: {
            outletId: outlet.id,
            OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }],
          },
          orderBy: { createdAt: "desc" },
          take: 15,
        }),
      ]);

  const total = orders.length + items.length + customers.length;

  return (
    <div>
      <PageHeader
        title="Search"
        description={
          empty
            ? "Type at least 2 characters in the search bar above"
            : `${total} result${total === 1 ? "" : "s"} for "${q}"`
        }
      />

      <Card className="mb-4">
        <CardContent className="p-3">
          <form action="/search" method="GET" className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={q} placeholder="Search invoices, items, customers…" className="pl-8" autoFocus />
          </form>
        </CardContent>
      </Card>

      {!empty && total === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No matches for <strong>{q}</strong>. Try the invoice number, customer phone, or part of an item name.
          </CardContent>
        </Card>
      )}

      {orders.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Receipt className="h-4 w-4" />
              Orders ({orders.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent">
                    <span className="font-mono text-xs">{o.invoiceNo}</span>
                    {o.aggregatorOrderId && (
                      <span className="font-mono text-[10px] text-muted-foreground">{o.aggregatorOrderId}</span>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {o.orderType.replace("_", " ")}
                    </Badge>
                    <span className="text-sm text-muted-foreground flex-1 truncate">
                      {o.customer?.name ?? "Walk-in"}
                    </span>
                    <span className="font-semibold">{inr(o.grandTotal)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {items.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <UtensilsCrossed className="h-4 w-4" />
              Items ({items.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {items.map((it) => (
                <li key={it.id}>
                  <Link href={`/menu/items/${it.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent">
                    <span
                      className={`h-3 w-3 rounded-sm border ${it.isVeg ? "border-emerald-600" : "border-rose-600"} flex items-center justify-center shrink-0`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${it.isVeg ? "bg-emerald-600" : "bg-rose-600"}`} />
                    </span>
                    <span className="font-medium">{it.name}</span>
                    <span className="text-xs text-muted-foreground">{it.category.name}</span>
                    <span className="ml-auto font-semibold">{inr(it.price)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {customers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4" />
              Customers ({customers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {customers.map((c) => (
                <li key={c.id}>
                  <Link href={`/customers/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent">
                    <span className="font-medium">{c.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{c.phone}</span>
                    {c.loyaltyPoints > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {c.loyaltyPoints} pts
                      </Badge>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
