import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { inr } from "@/lib/utils";
import { Plus } from "lucide-react";
import { Empty } from "@/components/ui/empty";
import { PlanDialog, EnrollDialog, RedeemDialog } from "./client";

export const dynamic = "force-dynamic";

export default async function MembershipsPage() {
  await requireUser("BILLER");
  const outlet = await getActiveOutlet();

  const [plans, memberships, items] = await Promise.all([
    db.membershipPlan.findMany({
      where: { outletId: outlet.id },
      include: {
        benefits: { include: { item: true, benefitDef: true } },
        _count: { select: { memberships: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.membership.findMany({
      where: { customer: { outletId: outlet.id } },
      include: {
        customer: true,
        plan: { include: { benefits: true } },
        redemptions: { orderBy: { createdAt: "desc" }, take: 5, include: { outlet: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.item.findMany({
      where: { outletId: outlet.id, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const now = new Date();
  const activeMembers = memberships.filter((m) => m.active && m.expiresAt > now);

  return (
    <div>
      <PageHeader
        title="Memberships"
        description={`${plans.length} plan${plans.length === 1 ? "" : "s"} · ${activeMembers.length} active member${activeMembers.length === 1 ? "" : "s"}`}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/cve">Wallet & Offers →</Link>
            </Button>
            <PlanDialog items={items}>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4" />
                Plan
              </Button>
            </PlanDialog>
            <EnrollDialog plans={plans.map((p) => ({ id: p.id, name: p.name, price: p.price }))}>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Enroll member
              </Button>
            </EnrollDialog>
            <RedeemDialog>
              <Button size="sm" variant="secondary">
                Redeem
              </Button>
            </RedeemDialog>
          </>
        }
      />

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members ({memberships.length})</TabsTrigger>
          <TabsTrigger value="plans">Plans ({plans.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          {memberships.length === 0 ? (
            <Card>
              <CardContent>
                <Empty
                  title="No members yet"
                  desc="Create a plan first, then enroll customers by phone number."
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Today's redemption</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {memberships.map((m) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const redeemedToday = m.redemptions.find(
                        (r) => new Date(r.businessDay).getTime() === today.getTime()
                      );
                      const expired = m.expiresAt < now;
                      return (
                        <TableRow key={m.id}>
                          <TableCell>
                            <Link href={`/customers/${m.customerId}`} className="font-medium hover:underline">
                              {m.customer.name}
                            </Link>
                            <div className="text-xs text-muted-foreground font-mono">{m.customer.phone}</div>
                          </TableCell>
                          <TableCell className="text-sm">{m.plan.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(m.startsAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(m.expiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                          </TableCell>
                          <TableCell className="text-xs">
                            {redeemedToday ? (
                              <span className="text-emerald-700">
                                ✓ at {redeemedToday.outlet.name}{" "}
                                <span className="text-muted-foreground">
                                  ({new Date(redeemedToday.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })})
                                </span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Not yet</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {!m.active ? (
                              <Badge variant="secondary">Cancelled</Badge>
                            ) : expired ? (
                              <Badge variant="destructive">Expired</Badge>
                            ) : (
                              <Badge variant="success">Active</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="plans">
          {plans.length === 0 ? (
            <Card>
              <CardContent>
                <Empty
                  title="No plans yet"
                  desc="Create one: e.g. Tea Club at ₹1000/year for 1 cup of tea per day."
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {plans.map((p) => (
                <Card key={p.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      {p.name}
                      <Badge variant="outline">{p._count.memberships} member{p._count.memberships === 1 ? "" : "s"}</Badge>
                    </CardTitle>
                    <CardDescription>
                      {inr(p.price)} · valid {p.durationDays} days
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {p.benefits.map((b) => {
                      const cve = b.benefitDef;
                      return (
                        <div key={b.id} className="flex items-center gap-2 flex-wrap">
                          <span className="text-emerald-700">✓</span>
                          <span>{b.name}</span>
                          {cve ? (
                            <>
                              <Badge variant="info" className="font-mono text-[9px]">
                                {cve.type}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                CVE registry
                              </Badge>
                            </>
                          ) : (
                            <>
                              {b.item && (
                                <Badge variant="outline" className="text-[10px]">
                                  {b.item.name}
                                </Badge>
                              )}
                              <Badge variant="secondary" className="text-[10px]">
                                {b.qtyPerDay}/day · across outlets
                              </Badge>
                            </>
                          )}
                        </div>
                      );
                    })}
                    {p.benefits.some((b) => b.benefitDefId) ? (
                      <div className="text-[10px] text-muted-foreground mt-1">
                        Registry-backed benefits fire through the CVE rule engine at billing.
                        Legacy per-day-item benefits keep their daily-cap unique index intact.
                      </div>
                    ) : null}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <PlanDialog
                        items={items}
                        initial={{
                          id: p.id,
                          name: p.name,
                          price: p.price,
                          durationDays: p.durationDays,
                          benefitName: p.benefits.find((b) => !b.benefitDefId)?.name ?? "",
                          benefitItemId: p.benefits.find((b) => !b.benefitDefId)?.itemId ?? "",
                          qtyPerDay: p.benefits.find((b) => !b.benefitDefId)?.qtyPerDay ?? 1,
                        }}
                      >
                        <Button variant="ghost" size="sm">Edit</Button>
                      </PlanDialog>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href="/admin/cve/benefits">
                          <Plus className="h-3.5 w-3.5" />
                          Add CVE benefit
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="mt-4 text-xs text-muted-foreground">
        <strong>Foolproof daily cap:</strong> the database has a unique index on (member × benefit × business day). Even
        if the member tries to redeem at two outlets simultaneously, only one succeeds — the other is rejected by the DB
        with a message naming the outlet where it was already used.
      </div>
    </div>
  );
}
