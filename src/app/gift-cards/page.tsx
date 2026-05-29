import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { Plus, Search } from "lucide-react";
import { IssueDialog, TopUpButton, DeactivateButton } from "./client";

export const dynamic = "force-dynamic";

export default async function GiftCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser("MANAGER");
  const sp = await searchParams;
  const outlet = await getActiveOutlet();
  const where: any = { outletId: outlet.id };
  if (sp.q) {
    where.OR = [{ code: { contains: sp.q.toUpperCase(), mode: "insensitive" } }];
  }
  const cards = await db.giftCard.findMany({
    where,
    include: { customer: true, _count: { select: { txns: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const totalLive = await db.giftCard.aggregate({
    where: { outletId: outlet.id, active: true },
    _sum: { balance: true },
    _count: true,
  });
  const totalIssued = await db.giftCard.aggregate({
    where: { outletId: outlet.id },
    _sum: { initialAmount: true },
  });

  return (
    <div>
      <PageHeader
        title="Gift cards"
        description={`${totalLive._count ?? 0} active cards · ${inr(totalLive._sum.balance ?? 0)} live balance · ${inr(totalIssued._sum.initialAmount ?? 0)} lifetime issued`}
        actions={
          <IssueDialog>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Issue card
            </Button>
          </IssueDialog>
        }
      />

      <Card className="mb-3">
        <CardContent className="p-3">
          <form className="relative" action="/gift-cards" method="GET">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search by code…" className="pl-8 max-w-sm font-mono" />
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Initial</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cards.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-12">
                    No gift cards yet.
                  </TableCell>
                </TableRow>
              ) : (
                cards.map((c) => {
                  const spent = c.initialAmount - c.balance;
                  const expired = c.expiresAt ? c.expiresAt.getTime() < Date.now() : false;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono font-semibold">
                        <Link href={`/gift-cards/${c.id}`} className="hover:underline">
                          {c.code}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {c.customer ? (
                          <Link href={`/customers/${c.customer.id}`} className="hover:underline">
                            {c.customer.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{inr(c.initialAmount)}</TableCell>
                      <TableCell className="text-right font-semibold">{inr(c.balance)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{spent > 0 ? inr(spent) : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.expiresAt
                          ? new Date(c.expiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {!c.active ? (
                          <Badge variant="secondary">Inactive</Badge>
                        ) : expired ? (
                          <Badge variant="destructive">Expired</Badge>
                        ) : c.balance <= 0 ? (
                          <Badge variant="warning">Empty</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <TopUpButton id={c.id} code={c.code} />
                          <DeactivateButton id={c.id} code={c.code} active={c.active} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
