import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { inr } from "@/lib/utils";
import { Search } from "lucide-react";
import { SettleDialog } from "./client";

export const dynamic = "force-dynamic";

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser("MANAGER");
  const sp = await searchParams;
  const outlet = await getActiveOutlet();

  const where: any = {
    outletId: outlet.id,
    closedAt: null,
    status: { in: ["PRINTED", "SAVED"] },
  };
  if (sp.q) {
    where.OR = [
      { invoiceNo: { contains: sp.q, mode: "insensitive" as const } },
      { customer: { is: { phone: { contains: sp.q, mode: "insensitive" as const } } } },
      { customer: { is: { name: { contains: sp.q, mode: "insensitive" as const } } } },
    ];
  }

  const unsettled = await db.order.findMany({
    where,
    include: { customer: true, table: true, payments: true },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const totalOutstanding = unsettled.reduce((s, o) => s + (o.grandTotal - o.amountPaid), 0);
  const counts = {
    DUE: unsettled.filter((o) => o.paymentMode === "DUE").length,
    HELD: unsettled.filter((o) => !o.paymentMode).length,
    PARTIAL: unsettled.filter((o) => o.amountPaid > 0).length,
  };

  return (
    <div>
      <PageHeader
        title="Due payment settlement"
        description={`${unsettled.length} unsettled · ${inr(totalOutstanding)} balance · ${counts.DUE} due · ${counts.HELD} held · ${counts.PARTIAL} part-paid`}
      />

      <Card className="mb-3">
        <CardContent className="p-3">
          <form action="/settlements" method="GET" className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Search invoice no., customer name or phone…"
              className="pl-8 max-w-md"
            />
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Bill</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-40">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unsettled.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-12">
                    Nothing pending. All bills are settled.
                  </TableCell>
                </TableRow>
              ) : (
                unsettled.map((o) => {
                  const balance = o.grandTotal - o.amountPaid;
                  const ageDays = Math.round((Date.now() - new Date(o.createdAt).getTime()) / 86400000);
                  const partial = o.amountPaid > 0;
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">
                        <Link href={`/orders/${o.id}`} className="hover:underline">
                          {o.invoiceNo}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(o.createdAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })}
                        {ageDays > 0 && <span className="ml-1 text-[10px]">· {ageDays}d ago</span>}
                      </TableCell>
                      <TableCell>
                        {o.customer ? (
                          <div>
                            <Link href={`/customers/${o.customer.id}`} className="hover:underline">
                              {o.customer.name}
                            </Link>
                            {o.customer.phone && (
                              <div className="text-xs text-muted-foreground font-mono">{o.customer.phone}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Walk-in</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {o.orderType.replace("_", " ")}
                        {o.table?.name && <span className="text-muted-foreground"> · {o.table.name}</span>}
                      </TableCell>
                      <TableCell className="text-right">{inr(o.grandTotal)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {o.amountPaid > 0 ? inr(o.amountPaid) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-rose-700">{inr(balance)}</TableCell>
                      <TableCell>
                        {partial ? (
                          <Badge variant="info">Partial</Badge>
                        ) : o.paymentMode === "DUE" ? (
                          <Badge variant="warning">DUE</Badge>
                        ) : (
                          <Badge variant="secondary">HELD</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <SettleDialog
                          orderId={o.id}
                          invoiceNo={o.invoiceNo}
                          balance={balance}
                          alreadyPaid={o.amountPaid}
                          grandTotal={o.grandTotal}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-4 text-xs text-muted-foreground">
        Each payment is recorded as its own receipt row. Balance = bill total − sum of receipts received. Bills move to <strong>PAID</strong> only when the balance hits ₹0; cash receipts automatically appear in the cash drawer.
      </div>
    </div>
  );
}
