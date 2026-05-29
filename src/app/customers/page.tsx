import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { Plus, Search } from "lucide-react";
import { CustomerDialog } from "./client";

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const outlet = await getActiveOutlet();

  const customers = await db.customer.findMany({
    where: {
      outletId: outlet.id,
      ...(sp.q
        ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { phone: { contains: sp.q, mode: "insensitive" } }] }
        : {}),
    },
    include: {
      orders: { select: { grandTotal: true, createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Customers"
        description={`${customers.length} customers · tag-based segmentation enabled`}
        actions={
          <CustomerDialog>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add customer
            </Button>
          </CustomerDialog>
        }
      />

      <Card className="mb-3">
        <CardContent className="p-3">
          <form className="relative" action="/customers" method="GET">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search by name or phone…" className="pl-8 max-w-sm" />
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Lifetime spend</TableHead>
                <TableHead className="text-right">Last visit</TableHead>
                <TableHead className="text-right w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => {
                const total = c.orders.reduce((s, o) => s + o.grandTotal, 0);
                const last = c.orders.length
                  ? c.orders.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)).createdAt
                  : null;
                const tags = c.tags ? c.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link href={`/customers/${c.id}`} className="hover:underline">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{c.phone ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {tags.map((t) => (
                          <Badge key={t} variant="outline">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{c.orders.length}</TableCell>
                    <TableCell className="text-right font-medium">{inr(total)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {last ? new Date(last).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <CustomerDialog
                        initial={{
                          id: c.id,
                          name: c.name,
                          phone: c.phone ?? "",
                          email: c.email ?? "",
                          address: c.address ?? "",
                          gstin: c.gstin ?? "",
                          tags: c.tags ?? "",
                        }}
                      >
                        <Button variant="ghost" size="sm">
                          Edit
                        </Button>
                      </CustomerDialog>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
