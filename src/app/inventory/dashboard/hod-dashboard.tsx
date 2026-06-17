import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ChefHat, ClipboardList, Inbox, PackageCheck, Plus, TrendingDown } from "lucide-react";
import { db } from "@/lib/db";
import { stockAtDepartment } from "@/lib/stock";
import { rmDepartmentFilter } from "@/lib/department-scope";
import { RaiseGrnButton } from "../departments/[id]/raise-grn";

/**
 * Department dashboard for HODs (Chef / Bartender / Housekeeping).
 *
 * Matches box #4 of the inventory flow chart exactly:
 *   • Current Stock (their dept's on-hand)
 *   • Low Stock Alerts (items below the minimum)
 *   • Items Requiring Replenishment (suggested qty = par − on-hand)
 *   • Pending Requisitions Status (their own raised reqs)
 *
 * Scoped two ways:
 *   1. Catalog filtered through allowedDepartments — Chef HOD never sees
 *      Vodka, Bartender HOD never sees Paneer.
 *   2. On-hand qty pulled from stockAtDepartment(deptId) so each tile
 *      reflects the department ledger, not the outlet total.
 */
export async function HodDashboard({
  outletId,
  outletName,
  user,
  deptKind,
}: {
  outletId: string;
  outletName: string;
  user: { id: string; name: string; role: string; departmentId: string | null };
  deptKind: string;
}) {
  // Catalog scoped to the HOD's dept — items with no allowedDepartments
  // or whose CSV includes this dept kind.
  const deptScope = rmDepartmentFilter(user.role);
  const rms = await db.rawMaterial.findMany({
    where: { outletId, active: true, ...(deptScope ?? {}) },
    select: {
      id: true,
      name: true,
      unit: true,
      minLevel: true,
      parLevel: true,
      avgCost: true,
      categoryName: true,
    },
    orderBy: { name: "asc" },
  });

  // Resolve the HOD's department row — used for the dept-scoped on-hand
  // qty lookup. Falls back to the first matching active department if the
  // user wasn't seeded with a departmentId (manager-created users).
  const dept =
    user.departmentId
      ? await db.department.findFirst({
          where: { id: user.departmentId, outletId, active: true },
        })
      : await db.department.findFirst({
          where: { outletId, kind: deptKind, active: true },
        });

  // Per-RM on-hand from the dept ledger. Done in parallel — typically 20-50
  // RMs per dept so it's quick.
  const stockRows = dept
    ? await Promise.all(
        rms.map(async (r) => ({
          rm: r,
          qty: await stockAtDepartment(r.id, dept.id),
        }))
      )
    : rms.map((r) => ({ rm: r, qty: 0 }));

  const belowMin = stockRows.filter((r) => r.qty < r.rm.minLevel);
  const belowPar = stockRows.filter((r) => r.qty >= r.rm.minLevel && r.qty < r.rm.parLevel);
  const stockValue = stockRows.reduce((s, r) => s + r.qty * (r.rm.avgCost ?? 0), 0);

  // Pending requisitions the HOD has raised, by status. Reviewed but not
  // yet fulfilled rows count as "pending" too — they're still en route.
  const reqs = await db.requisition.findMany({
    where: {
      outletId,
      requestedById: user.id,
      status: { in: ["NEW", "APPROVED", "PARTIAL"] },
    },
    select: { id: true, reqNo: true, status: true, createdAt: true, lines: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Transfers the store has dispatched to this dept and that haven't been
  // received yet (INTERNAL + SENT). The Raise GRN dialog pulls them into the
  // dept ledger and flips the transfer to RECEIVED.
  const fromDeptId = dept?.id;
  const readyToReceive = fromDeptId
    ? await db.transfer.findMany({
        where: {
          kind: "INTERNAL",
          status: "SENT",
          toDepartmentId: fromDeptId,
          receiverOutletId: outletId,
        },
        include: {
          lines: { include: { rawMaterial: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 25,
      })
    : [];

  // Shared mapping for the Raise GRN button (used in the header + banner).
  const grnTransfers = readyToReceive.map((t) => ({
    id: t.id,
    label: t.challanNo ?? t.id.slice(0, 8),
    sentAtLabel: t.createdAt.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
    lines: t.lines
      .filter((l) => l.qtySent > 0)
      .map((l) => ({ name: l.rawMaterial.name, qtySent: l.qtySent, unit: l.unit })),
  }));

  return (
    <div>
      <PageHeader
        title={`${dept?.name ?? deptKind} dashboard`}
        description={`${outletName} · scoped to items your department can request`}
        actions={
          <>
            {dept && readyToReceive.length > 0 && (
              <RaiseGrnButton deptName={dept.name} transfers={grnTransfers} />
            )}
            <Button asChild size="sm">
              <Link href="/inventory/requisitions/new">
                <Plus className="h-4 w-4" />
                New requisition
              </Link>
            </Button>
          </>
        }
      />

      {/* Ready-to-receive banner — front-and-centre when SM has approved
          requisitions waiting. The same button is also in the header so
          either click works. */}
      {dept && readyToReceive.length > 0 && (
        <Card className="mb-4 border-emerald-300 bg-emerald-50/40">
          <CardContent className="p-3 flex items-start gap-3">
            <PackageCheck className="h-5 w-5 text-emerald-700 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-emerald-900 text-sm">
                {readyToReceive.length} transfer{readyToReceive.length === 1 ? "" : "s"} ready to receive
              </div>
              <div className="text-sm text-emerald-800 mt-0.5">
                The store has dispatched stock to your department. Click <strong>Raise GRN</strong> to receive
                it — that moves it from the store into your department's ledger.
              </div>
            </div>
            <RaiseGrnButton deptName={dept.name} transfers={grnTransfers} />
          </CardContent>
        </Card>
      )}

      {/* KPI strip — Current Stock + Low Stock + Replenishment */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Card className="border-2">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Current stock value
              </div>
              <div className="text-2xl font-semibold mt-1 tabular-nums">
                ₹{Math.round(stockValue).toLocaleString("en-IN")}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {stockRows.length} item(s) in your catalog
              </div>
            </div>
            <ChefHat className="h-6 w-6 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card className={belowMin.length > 0 ? "border-2 border-rose-300 bg-rose-50/40" : "border-2"}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-rose-800">
                Low stock alerts
              </div>
              <div className={`text-2xl font-semibold mt-1 ${belowMin.length > 0 ? "text-rose-800" : ""}`}>
                {belowMin.length}
              </div>
              <div className="text-[11px] text-rose-700 mt-1">Items below min level</div>
            </div>
            <AlertTriangle className="h-6 w-6 text-rose-600" />
          </CardContent>
        </Card>

        <Card className={belowPar.length > 0 ? "border-2 border-amber-300 bg-amber-50/40" : "border-2"}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-amber-900">
                Replenish soon
              </div>
              <div className={`text-2xl font-semibold mt-1 ${belowPar.length > 0 ? "text-amber-800" : ""}`}>
                {belowPar.length}
              </div>
              <div className="text-[11px] text-amber-800 mt-1">Items below par level</div>
            </div>
            <TrendingDown className="h-6 w-6 text-amber-600" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Low Stock — needs attention */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              Low stock — below min
            </CardTitle>
            <CardDescription>Raise a requisition before you run out.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {belowMin.length === 0 ? (
              <Empty title="No low stock" desc="Everything's above its min level. Nice work." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Min</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {belowMin.map((r) => (
                    <TableRow key={r.rm.id}>
                      <TableCell className="font-medium">
                        {r.rm.name}
                        {r.rm.categoryName && (
                          <span className="ml-1 text-[10px] text-muted-foreground">· {r.rm.categoryName}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-rose-700 font-semibold">
                        {r.qty} {r.rm.unit}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {r.rm.minLevel} {r.rm.unit}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Replenishment — below par with suggested qty */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-1.5">
              <PackageCheck className="h-4 w-4 text-amber-600" />
              Items requiring replenishment
            </CardTitle>
            <CardDescription>
              Suggested qty = par level − on-hand. Use these when you raise the requisition.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {belowPar.length === 0 ? (
              <Empty title="No replenishment needed" desc="Every item is above par." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Par</TableHead>
                    <TableHead className="text-right">Suggested</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {belowPar.map((r) => {
                    const suggested = Math.max(0, r.rm.parLevel - r.qty);
                    return (
                      <TableRow key={r.rm.id}>
                        <TableCell className="font-medium">{r.rm.name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.qty} {r.rm.unit}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {r.rm.parLevel} {r.rm.unit}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-amber-700">
                          {suggested.toFixed(2)} {r.rm.unit}
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

      {/* Complete department stock — every item the HOD can request, with
          current on-hand qty pulled from the dept ledger. The chef wanted
          this because the alert tables only show pain points; for sizing a
          requisition they need to see the whole catalog at a glance. */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-1.5">
            <ChefHat className="h-4 w-4" />
            Complete stock at your department
          </CardTitle>
          <CardDescription>
            Every item your department can request, with on-hand qty + min/par. Click
            "New requisition" above to raise one for any of these.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {stockRows.length === 0 ? (
            <Empty
              title="No items in your catalog yet"
              desc={
                dept
                  ? "Ask the manager to tag raw materials with your department so they appear here."
                  : "Your user account isn't linked to a department. Ask the owner to set one in Settings → Users."
              }
            />
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Min / Par</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockRows.map((r) => {
                    const tone =
                      r.qty < r.rm.minLevel
                        ? "destructive"
                        : r.qty < r.rm.parLevel
                          ? "warning"
                          : "success";
                    const value = r.qty * (r.rm.avgCost ?? 0);
                    return (
                      <TableRow key={r.rm.id}>
                        <TableCell className="font-medium">{r.rm.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.rm.categoryName ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={tone as any} className="text-[10px] tabular-nums">
                            {r.qty} {r.rm.unit}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                          {r.rm.minLevel} / {r.rm.parLevel} {r.rm.unit}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          ₹{Math.round(value).toLocaleString("en-IN")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Requisitions Status */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-1.5">
            <ClipboardList className="h-4 w-4" />
            Pending requisitions
          </CardTitle>
          <CardDescription>Requisitions you've raised that haven't been delivered yet.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {reqs.length === 0 ? (
            <Empty
              title="No pending requisitions"
              desc="Click 'New requisition' above to raise one."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Req #</TableHead>
                  <TableHead>Raised</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reqs.map((r) => {
                  const tone =
                    r.status === "NEW"
                      ? "warning"
                      : r.status === "APPROVED"
                        ? "success"
                        : "secondary";
                  const label =
                    r.status === "NEW"
                      ? "Pending review"
                      : r.status === "APPROVED"
                        ? "Approved · awaiting transfer"
                        : "Partially approved";
                  return (
                    <TableRow key={r.id} className="hover:bg-accent/40">
                      <TableCell>
                        <Link
                          href={`/inventory/requisitions/${r.id}`}
                          className="font-mono text-xs hover:underline"
                        >
                          {r.reqNo}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.createdAt.toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-right text-xs">{r.lines.length}</TableCell>
                      <TableCell>
                        <Badge variant={tone as any} className="text-[10px]">
                          {label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>HOD view · only items your department is allowed to request appear here.</span>
        <Link href="/inventory/requisitions" className="hover:underline inline-flex items-center gap-1">
          <Inbox className="h-3.5 w-3.5" /> View all my requisitions
        </Link>
      </div>
    </div>
  );
}
