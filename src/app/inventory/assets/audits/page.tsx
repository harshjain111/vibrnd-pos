import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { fmtDate } from "@/lib/utils";
import { ClipboardCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AllAuditsPage() {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const audits = await db.assetAudit.findMany({
    where: { outletId: outlet.id },
    orderBy: { auditedAt: "desc" },
    include: { lines: true },
    take: 200,
  });
  // Hydrate auditor names in a single follow-up query.
  const auditorIds = Array.from(new Set(audits.map((a) => a.auditedById).filter(Boolean) as string[]));
  const auditors = auditorIds.length
    ? await db.user.findMany({ where: { id: { in: auditorIds } }, select: { id: true, name: true } })
    : [];
  const auditorName = new Map(auditors.map((u) => [u.id, u.name]));

  return (
    <div>
      <PageHeader
        title="Asset audits"
        description="History of every fixed-asset audit. Variance lines are your anti-theft signal — investigate any non-zero Δ."
        actions={
          <Button asChild size="sm">
            <Link href="/inventory/assets/audits/new">
              <ClipboardCheck className="h-4 w-4" />
              New audit
            </Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="p-0">
          {audits.length === 0 ? (
            <Empty icon={ClipboardCheck} title="No audits yet" desc="Click 'New audit' to do your first floor walk." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Auditor</TableHead>
                  <TableHead className="text-right">Lines checked</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audits.map((a) => (
                  <TableRow key={a.id} className="hover:bg-accent/40">
                    <TableCell>
                      <Link href={`/inventory/assets/audits/${a.id}`} className="hover:underline text-sm">
                        {fmtDate(a.auditedAt, "datetime")}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.auditedById ? (auditorName.get(a.auditedById) ?? "—") : "—"}
                    </TableCell>
                    <TableCell className="text-right">{a.lines.length}</TableCell>
                    <TableCell className="text-right">
                      {a.varianceLines > 0 ? (
                        <Badge variant="destructive" className="text-[10px]">{a.varianceLines}</Badge>
                      ) : (
                        <Badge variant="success" className="text-[10px]">all match</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">
                      {a.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
