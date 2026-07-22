import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { ArrowLeft, Plus } from "lucide-react";
import { BenefitFormDialog } from "./benefit-form";
import { AttachPlanForm, DetachBenefitButton } from "./plan-links";
import type { BenefitType } from "@/lib/cve/types";
import { toggleBenefitAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function BenefitsPage() {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();

  const [defs, items, plans] = await Promise.all([
    db.benefitDef.findMany({
      where: { outletId: outlet.id },
      include: {
        membershipBenefits: { include: { plan: { select: { id: true, name: true } } } },
        _count: { select: { campaignBenefits: true } },
      },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    }),
    db.item.findMany({
      where: { outletId: outlet.id, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.membershipPlan.findMany({
      where: { outletId: outlet.id, active: true },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Benefit registry"
        description="Reusable THEN-actions. Attach them to memberships or campaigns from here."
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/cve">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <BenefitFormDialog
              items={items}
              trigger={
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  New benefit
                </Button>
              }
            />
          </>
        }
      />

      <Card>
        <CardContent className="p-0">
          {defs.length === 0 ? (
            <Empty
              title="No benefits yet"
              desc="Create your first benefit — it becomes reusable across memberships and campaigns."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Config</TableHead>
                  <TableHead>Attached to</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {defs.map((d) => {
                  const cfg = safeParse(d.configJson);
                  const membershipLinks = d.membershipBenefits;
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {d.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground max-w-[240px] truncate">
                        {cfgSummary(d.type as BenefitType, cfg) ?? d.configJson}
                      </TableCell>
                      <TableCell className="text-xs">
                        {membershipLinks.length === 0 && d._count.campaignBenefits === 0 ? (
                          <span className="text-muted-foreground">Unlinked</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {membershipLinks.map((mb) => (
                              <span
                                key={mb.id}
                                className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5"
                              >
                                <Link
                                  href={`/memberships`}
                                  className="hover:underline"
                                >
                                  {mb.plan.name}
                                </Link>
                                <DetachBenefitButton membershipBenefitId={mb.id} />
                              </span>
                            ))}
                            {d._count.campaignBenefits > 0 ? (
                              <Badge variant="info" className="text-[10px]">
                                {d._count.campaignBenefits} campaign
                                {d._count.campaignBenefits === 1 ? "" : "s"}
                              </Badge>
                            ) : null}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {d.active ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Off</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <BenefitFormDialog
                            items={items}
                            initial={{
                              id: d.id,
                              name: d.name,
                              type: d.type as BenefitType,
                              active: d.active,
                              config: cfg,
                            }}
                            trigger={
                              <Button variant="ghost" size="sm">
                                Edit
                              </Button>
                            }
                          />
                          <AttachPlanForm
                            benefitDefId={d.id}
                            defaultName={d.name}
                            plans={plans.filter(
                              (p) => !membershipLinks.some((mb) => mb.plan.id === p.id),
                            )}
                          />
                          <form action={toggleBenefitAction}>
                            <input type="hidden" name="id" value={d.id} />
                            <input type="hidden" name="active" value={String(!d.active)} />
                            <Button variant="ghost" size="sm" type="submit">
                              {d.active ? "Turn off" : "Turn on"}
                            </Button>
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground mt-3">
        Legacy per-day-item benefits on existing membership plans keep working — the daily
        cap logic on {" "}
        <Link href="/memberships" className="text-primary underline-offset-2 hover:underline">
          /memberships
        </Link>{" "}
        is unchanged. Attach a registry benefit to a plan for the CVE code path to fire.
      </div>
    </div>
  );
}

function safeParse(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) ?? {};
  } catch {
    return {};
  }
}

/** Compact one-line preview of the config so the SM doesn't need to
 * expand every row to see amounts. */
function cfgSummary(type: BenefitType, cfg: Record<string, unknown>): string | null {
  const n = (k: string) => (cfg[k] != null ? Number(cfg[k]) : null);
  switch (type) {
    case "WALLET_CREDIT":
      return `₹${n("amount") ?? "?"} → ${cfg.bucket ?? "CAMPAIGN"}${cfg.expiresInDays ? ` · exp ${cfg.expiresInDays}d` : ""}`;
    case "WALLET_CASHBACK":
      return `${n("percent") ?? "?"}%${cfg.cap ? ` cap ₹${cfg.cap}` : ""}`;
    case "PERCENT_DISCOUNT":
      return `${n("percent") ?? "?"}% off ${cfg.appliesTo ?? "BILL"}${cfg.cap ? ` cap ₹${cfg.cap}` : ""}`;
    case "FLAT_DISCOUNT":
      return `₹${n("amount") ?? "?"} off ${cfg.appliesTo ?? "BILL"}`;
    case "FREE_ITEM":
    case "DAILY_ITEM":
    case "WEEKLY_ITEM":
    case "MONTHLY_ITEM":
      return `${n("qty") ?? 1}× item ${(cfg.itemId as string)?.slice(0, 8) ?? "?"}`;
    case "REWARD_POINTS":
      return cfg.per === "RUPEE" ? `1 pt per ₹${cfg.ratio ?? "?"}` : `${cfg.points ?? "?"} pts/bill`;
    case "BIRTHDAY_BENEFIT":
    case "ANNIVERSARY_BENEFIT":
      return cfg.walletCredit ? `₹${cfg.walletCredit} credit` : cfg.freeItemId ? "Free item" : (cfg.note as string) ?? "";
    case "ENTRY_WAIVER":
      return `Waive ₹${cfg.amount ?? "?"}`;
    default:
      return null;
  }
}
