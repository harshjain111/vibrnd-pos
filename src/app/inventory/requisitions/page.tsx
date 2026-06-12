import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Plus, ClipboardList, Inbox, CheckCircle2, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser, ownedDepartmentKind } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { canAccess } from "@/lib/permissions";
import { stockAtDepartment } from "@/lib/stock";
import { RequisitionsTable, type Row } from "./list-client";

export const dynamic = "force-dynamic";

const STATUS_TABS = [
  { key: "PENDING", label: "Pending review", filter: ["NEW"], Icon: Inbox },
  { key: "ACTIVE", label: "Approved / Partial", filter: ["APPROVED", "PARTIAL"], Icon: CheckCircle2 },
  { key: "FULFILLED", label: "Fulfilled", filter: ["FULFILLED"], Icon: CheckCircle2 },
  { key: "DECLINED", label: "Declined / Cancelled", filter: ["DECLINED", "CANCELLED"], Icon: XCircle },
  { key: "ALL", label: "All", filter: null, Icon: ClipboardList },
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
  const canReview = !!user && canAccess(user.role, "inventory.requisitions.approve");

  const activeTab = STATUS_TABS.find((t) => t.key === tab) ?? STATUS_TABS[0];

  // HODs only see their dept's requisitions; everyone else sees the full
  // outlet queue + inbound chain reqs targeting this outlet's STORE.
  const hodKind = user ? ownedDepartmentKind(user.role) : null;
  const hodDept = hodKind
    ? await db.department.findFirst({ where: { outletId: outlet.id, kind: hodKind, active: true } })
    : null;
  const ownStoreDept = await db.department.findFirst({
    where: { outletId: outlet.id, kind: "STORE", active: true },
  });

  const baseWhere = activeTab.filter
    ? { status: { in: activeTab.filter as unknown as string[] } }
    : {};
  const where: any = {
    ...baseWhere,
    OR: [
      { outletId: outlet.id, ...(hodDept ? { fromDepartmentId: hodDept.id } : {}) },
      ...(ownStoreDept && !hodDept ? [{ toDepartmentId: ownStoreDept.id, NOT: { outletId: outlet.id } }] : []),
    ],
  };

  const [counts, reqs] = await Promise.all([
    Promise.all(
      STATUS_TABS.map(async (t) => ({
        key: t.key,
        n: await db.requisition.count({
          where: {
            ...(t.filter ? { status: { in: t.filter as unknown as string[] } } : {}),
            OR: [
              { outletId: outlet.id, ...(hodDept ? { fromDepartmentId: hodDept.id } : {}) },
              ...(ownStoreDept && !hodDept ? [{ toDepartmentId: ownStoreDept.id, NOT: { outletId: outlet.id } }] : []),
            ],
          },
        }),
      }))
    ),
    db.requisition.findMany({
      where,
      include: {
        outlet: { select: { name: true } },
        fromDepartment: { select: { name: true, kind: true, outletId: true } },
        toDepartment: { select: { name: true, outletId: true } },
        lines: { include: { rawMaterial: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  const countByKey = Object.fromEntries(counts.map((c) => [c.key, c.n]));

  // Pre-compute STORE on-hand for every line of reviewable requisitions —
  // surfaces "insufficient stock" hints + the "Raise PO" shortcut on both
  // PENDING and APPROVED/PARTIAL tabs without a per-keystroke server
  // roundtrip in the review form.
  const stockHints: Record<string, number> = {};
  const HINT_STATUSES = new Set(["NEW", "APPROVED", "PARTIAL"]);
  if (canReview && (activeTab.key === "PENDING" || activeTab.key === "ACTIVE")) {
    for (const r of reqs) {
      if (!HINT_STATUSES.has(r.status)) continue;
      for (const l of r.lines) {
        stockHints[l.id] = await stockAtDepartment(l.rawMaterialId, r.toDepartmentId);
      }
    }
  }

  // Hydrate requester names for the inline header (shows "Raised by …").
  const requesterIds = Array.from(
    new Set(reqs.map((r) => r.requestedById).filter(Boolean))
  ) as string[];
  const requesterNames = requesterIds.length
    ? new Map(
        (await db.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true } })).map(
          (u) => [u.id, u.name]
        )
      )
    : new Map<string, string>();

  const rows: Row[] = reqs.map((r) => {
    const isInbound = r.outletId !== outlet.id;
    const isCrossOutlet = r.fromDepartment.outletId !== r.toDepartment.outletId;
    return {
      id: r.id,
      reqNo: r.reqNo,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      fromLabel: isInbound ? `${r.outlet.name} · ${r.fromDepartment.name}` : r.fromDepartment.name,
      direction: isInbound ? "INBOUND" : isCrossOutlet ? "OUTBOUND_CHAIN" : "INTERNAL",
      requesterName: r.requestedById ? requesterNames.get(r.requestedById) ?? null : null,
      notes: r.notes,
      declineReason: r.declineReason,
      lines: r.lines.map((l) => ({
        id: l.id,
        name: l.rawMaterial.name,
        unit: l.unit,
        qtyRequested: l.qtyRequested,
        qtyApproved: l.qtyApproved,
        declineReason: l.declineReason,
        onHandAtStore: stockHints[l.id] ?? null,
      })),
    };
  });

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
            <RequisitionsTable rows={rows} canReview={canReview} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
