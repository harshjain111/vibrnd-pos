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
import { toggleCampaign } from "./actions";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();

  const rows = await db.campaign.findMany({
    where: { outletId: outlet.id },
    include: {
      _count: { select: { rules: true, benefits: true, redemptions: true } },
    },
    orderBy: [{ active: "desc" }, { priority: "desc" }, { createdAt: "desc" }],
  });

  const now = Date.now();

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Time-bound offers built from generic IF / THEN rules."
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/cve">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/admin/cve/campaigns/new">
                <Plus className="h-4 w-4" />
                New campaign
              </Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <Empty
              title="No campaigns yet"
              desc="Create one — a campaign is a set of rules plus a bundle of benefits from the registry."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Rules</TableHead>
                  <TableHead>Benefits</TableHead>
                  <TableHead>Redeemed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const started = c.startsAt.getTime() <= now;
                  const ended = c.endsAt.getTime() < now;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.name}</div>
                        {c.description ? (
                          <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                            {c.description}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtDate(c.startsAt, "long")} → {fmtDate(c.endsAt, "long")}
                      </TableCell>
                      <TableCell className="text-xs">{c.priority}</TableCell>
                      <TableCell className="text-xs">{c._count.rules}</TableCell>
                      <TableCell className="text-xs">{c._count.benefits}</TableCell>
                      <TableCell className="text-xs">
                        {c._count.redemptions}
                        {c.maxRedemptions ? (
                          <span className="text-muted-foreground"> / {c.maxRedemptions}</span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {!c.active ? (
                          <Badge variant="secondary">Off</Badge>
                        ) : ended ? (
                          <Badge variant="destructive">Ended</Badge>
                        ) : !started ? (
                          <Badge variant="info">Scheduled</Badge>
                        ) : (
                          <Badge variant="success">Live</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button size="sm" variant="ghost" asChild>
                            <Link href={`/admin/cve/campaigns/${c.id}`}>Edit</Link>
                          </Button>
                          <form action={toggleCampaign}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="active" value={String(!c.active)} />
                            <Button size="sm" variant="ghost" type="submit">
                              {c.active ? "Turn off" : "Turn on"}
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
    </div>
  );
}
