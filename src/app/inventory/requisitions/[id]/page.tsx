import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Truck, X, ShoppingCart } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { canAccess } from "@/lib/permissions";
import { stockAtDepartment } from "@/lib/stock";
import { fmtDate } from "@/lib/utils";
import { ReviewForm, CancelButton } from "./client";

export const dynamic = "force-dynamic";

export default async function RequisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();

  const req = await db.requisition.findFirst({
    where: { id, outletId: outlet.id },
    include: {
      fromDepartment: true,
      toDepartment: true,
      lines: { include: { rawMaterial: true } },
      transfer: true,
    },
  });
  if (!req) return notFound();

  // Optional hydration — auditor / requester / reviewer names
  const userIds = [req.requestedById, req.reviewedById].filter(Boolean) as string[];
  const userMap = new Map(
    userIds.length
      ? (await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name])
      : []
  );

  // Can the current viewer review? — SM, Manager, Owner (and not the
  // requester themselves, by convention) AND requisition is in NEW state.
  const canReview =
    !!user &&
    req.status === "NEW" &&
    canAccess(user.role, "inventory.requisitions.approve");

  // Can the current viewer fulfil? Same role check + status APPROVED/PARTIAL.
  const canFulfil =
    !!user &&
    (req.status === "APPROVED" || req.status === "PARTIAL") &&
    !req.transfer &&
    canAccess(user.role, "inventory.requisitions.approve");

  // Can the requester cancel?
  const canCancel = !!user && req.status === "NEW" && user.id === req.requestedById;

  // Compute on-hand stock at STORE per line — used by the review form to
  // surface "insufficient stock" warnings inline.
  const onHand = new Map<string, number>();
  for (const l of req.lines) {
    onHand.set(l.rawMaterialId, await stockAtDepartment(l.rawMaterialId, req.toDepartmentId));
  }

  // "Raise PO for shortfall" appears only AFTER approval (APPROVED / PARTIAL)
  // and only when the approved qty exceeds what the store holds.
  const canRaisePo =
    !!user &&
    canAccess(user.role, "inventory.requisitions.approve") &&
    (req.status === "APPROVED" || req.status === "PARTIAL") &&
    req.lines.some((l) => l.qtyApproved > (onHand.get(l.rawMaterialId) ?? 0));

  return (
    <div>
      <PageHeader
        title={`Requisition · ${req.reqNo}`}
        description={`Raised by ${userMap.get(req.requestedById ?? "") ?? "—"} from ${req.fromDepartment.name} on ${fmtDate(req.createdAt, "datetime")}`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/inventory/requisitions">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>
        }
      />

      {/* Status + action bar */}
      <Card className="mb-3">
        <CardContent className="p-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Status</span>
            <StatusBadge kind="requisition" status={req.status} />
            {req.reviewedById && (
              <span className="text-xs text-muted-foreground ml-2">
                Reviewed by {userMap.get(req.reviewedById) ?? "—"}
                {req.reviewedAt && ` · ${fmtDate(req.reviewedAt, "datetime")}`}
              </span>
            )}
          </div>
          <div className="flex gap-1.5">
            {canRaisePo && (
              <Button asChild variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50">
                <Link href={`/inventory/purchase/new?req=${req.id}`}>
                  <ShoppingCart className="h-4 w-4" />
                  Raise PO for shortfall
                </Link>
              </Button>
            )}
            {canFulfil && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50/60 px-3 py-1.5 text-xs text-sky-900">
                <Truck className="h-3.5 w-3.5" />
                Approved — dispatch this from the Transfers tab
              </span>
            )}
            {canCancel && <CancelButton id={req.id} />}
          </div>
        </CardContent>
      </Card>

      {/* Decline reason banner when applicable */}
      {req.status === "DECLINED" && req.declineReason && (
        <InlineAlert tone="bad" icon={<X className="h-4 w-4" />} title="Declined" className="mb-3">
          {req.declineReason}
        </InlineAlert>
      )}

      {/* Fulfilment banner — dispatched (awaiting dept GRN) vs received */}
      {req.status === "FULFILLED" && req.transfer && (
        <InlineAlert
          tone="good"
          icon={<Truck className="h-4 w-4" />}
          title={`${req.transfer.status === "RECEIVED" ? "Received" : "Dispatched"} via transfer ${req.transfer.challanNo ?? req.transfer.id}`}
          className="mb-3"
        >
          {req.transfer.status === "RECEIVED"
            ? `Stock received into ${req.fromDepartment.name} from ${req.toDepartment.name}.`
            : `Stock dispatched from ${req.toDepartment.name}. Awaiting GRN at ${req.fromDepartment.name} (Raise GRN on the department page).`}
        </InlineAlert>
      )}

      {/* Lines — either readonly or as a review form */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Items ({req.lines.length})</CardTitle>
          <CardDescription>
            {canReview
              ? "Approve in full, edit qty for partial approval (with a reason), or decline the whole thing."
              : "Requested vs approved per line."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {canReview ? (
            <ReviewForm
              requisitionId={req.id}
              lines={req.lines.map((l) => ({
                id: l.id,
                rawMaterialId: l.rawMaterialId,
                name: l.rawMaterial.name,
                unit: l.unit,
                qtyRequested: l.qtyRequested,
                qtyApproved: l.qtyApproved,
                declineReason: l.declineReason,
                onHandAtStore: onHand.get(l.rawMaterialId) ?? 0,
              }))}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Requested</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {req.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.rawMaterial.name}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {l.qtyRequested} {l.unit}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          l.qtyApproved === 0
                            ? "text-rose-700 font-semibold"
                            : l.qtyApproved < l.qtyRequested
                              ? "text-amber-700 font-semibold"
                              : "text-emerald-700 font-semibold"
                        }
                      >
                        {l.qtyApproved} {l.unit}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {l.declineReason ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Requester notes */}
      {req.notes && (
        <Card className="mt-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{req.notes}</CardContent>
        </Card>
      )}
    </div>
  );
}
