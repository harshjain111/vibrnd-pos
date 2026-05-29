import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { Download, Search } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  READY: "Ready",
  SERVED: "Served",
  CANCELLED: "Cancelled",
};

const STATUS_VARIANT: Record<string, "warning" | "info" | "success" | "secondary" | "destructive"> = {
  NEW: "warning",
  IN_PROGRESS: "info",
  READY: "success",
  SERVED: "secondary",
  CANCELLED: "destructive",
};

export default async function KotHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const outlet = await getActiveOutlet();

  const where: any = { outletId: outlet.id };
  if (sp.status && sp.status !== "all") where.status = sp.status;
  if (sp.q) where.kotNo = { contains: sp.q, mode: "insensitive" };

  const tickets = await db.kitchenTicket.findMany({
    where,
    include: { lines: true, order: { include: { table: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const counts = {
    NEW: tickets.filter((t) => t.status === "NEW").length,
    IN_PROGRESS: tickets.filter((t) => t.status === "IN_PROGRESS").length,
    READY: tickets.filter((t) => t.status === "READY").length,
    SERVED: tickets.filter((t) => t.status === "SERVED").length,
    CANCELLED: tickets.filter((t) => t.status === "CANCELLED").length,
  };

  return (
    <div>
      <PageHeader
        title="KOT history"
        description={`${tickets.length} tickets · live ones move on the KDS`}
        actions={
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4" />
            Export
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {(["NEW", "IN_PROGRESS", "READY", "SERVED", "CANCELLED"] as const).map((s) => (
          <Card key={s}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{STATUS_LABEL[s]}</div>
              <div className="text-xl font-semibold mt-0.5">{counts[s]}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-3">
        <CardContent className="p-3">
          <form className="flex gap-2 flex-wrap" action="/orders/kot" method="GET">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={sp.q ?? ""} placeholder="KOT number…" className="pl-8" />
            </div>
            <select
              name="status"
              defaultValue={sp.status ?? "all"}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="NEW">New</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="READY">Ready</option>
              <option value="SERVED">Served</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <Button type="submit">Apply</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>KOT</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/orders/kot/${t.id}/print`} className="hover:underline">
                      {t.kotNo}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{t.order.invoiceNo}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(t.createdAt).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>{t.order.orderType.replace("_", " ")}</TableCell>
                  <TableCell className="text-muted-foreground">{t.order.table?.name ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">
                    {t.lines.map((l) => `${l.name} ×${l.qty}`).join(", ")}
                  </TableCell>
                  <TableCell className="text-right">{t.lines.length}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
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
