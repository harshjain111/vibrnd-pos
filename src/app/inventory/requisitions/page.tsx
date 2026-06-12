import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, ClipboardList, Inbox, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser, ownedDepartmentKind } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS_TABS = [
  { key: "PENDING", label: "Pending review", filter: ["NEW"], Icon: Inbox, tone: "amber" },
  { key: "ACTIVE", label: "Approved / Partial", filter: ["APPROVED", "PARTIAL"], Icon: CheckCircle2, tone: "sky" },
  { key: "FULFILLED", label: "Fulfilled", filter: ["FULFILLED"], Icon: CheckCircle2, tone: "emerald" },
  { key: "DECLINED", label: "Declined / Cancelled", filter: ["DECLINED", "CANCELLED"], Icon: XCircle, tone: "rose" },
  { key: "ALL", label: "All", filter: null, Icon: ClipboardList, tone: "neutral" },
] as const;

type TabKey = (typeof STATUS_TABS)[number]["key"];

export default async function RequisitionsListPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: TabKey }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const tab = (sp.tab ?? "PENDING") as TabKey;
  const user = await getSessionUser();
  const outlet = await getActiveOutlet();

  const activeTab = STATUS_TABS.find((t) => t.key === tab) ?? STATUS_TABS[0];

  // HODs only see requisitions raised by THEIR department; everyone else
  // (SM / Manager / Owner) sees the full outlet queue.
  const hodKind = user ? ownedDepartmentKind(user.role) : null;
  const hodDept = hodKind
    ? await db.department.findFirst({ where: { outletId: outlet.id, kind: hodKind, active: true } })
    : null;

  const where = {
    outletId: outlet.id,
    ...(activeTab.filter ? { status: { in: activeTab.filter as unknown as string[] } } : {}),
    ...(hodDept ? { fromDepartmentId: hodDept.id } : {}),
  };

  const [counts, rows] = await Promise.all([
    Promise.all(
      STATUS_TABS.map(async (t) => ({
        key: t.key,
        n: await db.requisition.count({
          where: {
            outletId: outlet.id,
            ...(t.filter ? { status: { in: t.filter as unknown as string[] } } : {}),
            ...(hodDept ? { fromDepartmentId: hodDept.id } : {}),
          },
        }),
      }))
    ),
    db.requisition.findMany({
      where,
      include: {
        fromDepartment: { select: { name: true, kind: true } },
        toDepartment: { select: { name: true } },
        lines: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  const countByKey = Object.fromEntries(counts.map((c) => [c.key, c.n]));

  return (
    <div>
      <PageHeader
        title="Requisitions"
        description={
          hodDept
            ? `Items your ${hodDept.name.toLowerCase()} has requested from the store`
            : "Inbound requests from kitchen / bar / housekeeping waiting for the store"
        }
        actions={
          <Button asChild size="sm">
            <Link href="/inventory/requisitions/new">
              <Plus className="h-4 w-4" />
              New requisition
            </Link>
          </Button>
        }
      />

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {STATUS_TABS.map((t) => {
          const active = t.key === activeTab.key;
          const n = countByKey[t.key] ?? 0;
          const Icon = t.Icon;
          return (
            <Link
              key={t.key}
              href={t.key === "PENDING" ? "/inventory/requisitions" : `/inventory/requisitions?tab=${t.key}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              <Badge variant="outline" className="text-[10px] bg-background/50">
                {n}
              </Badge>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <Empty
              title="Nothing here"
              desc={
                activeTab.key === "PENDING"
                  ? "No pending requisitions. When a kitchen / bar / housekeeping HOD raises one, it'll show up here."
                  : "No requisitions match this filter."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Req #</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead>Raised</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-accent/40">
                    <TableCell>
                      <Link href={`/inventory/requisitions/${r.id}`} className="font-mono text-xs hover:underline">
                        {r.reqNo}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{r.fromDepartment.name}</TableCell>
                    <TableCell className="text-right text-sm">{r.lines.length}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.createdAt.toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: any; label: string }> = {
    NEW: { variant: "warning", label: "Pending" },
    APPROVED: { variant: "success", label: "Approved" },
    PARTIAL: { variant: "secondary", label: "Partial" },
    DECLINED: { variant: "destructive", label: "Declined" },
    FULFILLED: { variant: "success", label: "Fulfilled" },
    CANCELLED: { variant: "outline", label: "Cancelled" },
  };
  const cfg = map[status] ?? { variant: "outline", label: status };
  return (
    <Badge variant={cfg.variant} className="text-[10px]">
      {cfg.label}
    </Badge>
  );
}
