import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { getSessionUser } from "@/lib/session";
import { inr } from "@/lib/utils";
import { Plus, AlertTriangle } from "lucide-react";
import { ExpenseDialog, ApproveButton, RejectButton, ClearFlagButton } from "./client";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "warning" | "info" | "success" | "destructive"> = {
  PENDING_MANAGER: "warning",
  PENDING_AUDITOR: "info",
  APPROVED: "success",
  REJECTED: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_MANAGER: "Pending manager",
  PENDING_AUDITOR: "Pending auditor",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const filter = sp.filter ?? "open";

  const expenses = await db.expense.findMany({
    where: { outletId: outlet.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const userIds = Array.from(
    new Set(
      expenses.flatMap((e) => [e.createdById, e.managerApprovedById, e.auditorApprovedById, e.rejectedById].filter(Boolean) as string[])
    )
  );
  const users = await db.user.findMany({ where: { id: { in: userIds } } });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const open = expenses.filter((e) => e.status === "PENDING_MANAGER" || e.status === "PENDING_AUDITOR");
  const approved = expenses.filter((e) => e.status === "APPROVED");
  const rejected = expenses.filter((e) => e.status === "REJECTED");
  const flagged = expenses.filter((e) => e.ownerFlagged);

  const view =
    filter === "approved"
      ? approved
      : filter === "rejected"
      ? rejected
      : filter === "flagged"
      ? flagged
      : open;

  const totalsByCat = approved.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="Expenses"
        description={`${open.length} pending approval · ${approved.length} approved · ${rejected.length} rejected · ${flagged.length} owner-flagged`}
        actions={
          <ExpenseDialog>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Log expense
            </Button>
          </ExpenseDialog>
        }
      />

      {Object.keys(totalsByCat).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          {Object.entries(totalsByCat).map(([cat, amt]) => (
            <Card key={cat}>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">{cat}</div>
                <div className="text-lg font-semibold mt-0.5">{inr(amt)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs defaultValue={filter}>
        <TabsList>
          <TabsTrigger value="open" asChild>
            <Link href="/expenses?filter=open">Pending ({open.length})</Link>
          </TabsTrigger>
          <TabsTrigger value="approved" asChild>
            <Link href="/expenses?filter=approved">Approved ({approved.length})</Link>
          </TabsTrigger>
          <TabsTrigger value="rejected" asChild>
            <Link href="/expenses?filter=rejected">Rejected ({rejected.length})</Link>
          </TabsTrigger>
          {user?.role === "OWNER" && flagged.length > 0 && (
            <TabsTrigger value="flagged" asChild>
              <Link href="/expenses?filter=flagged" className="text-rose-700">Owner flagged ({flagged.length})</Link>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value={filter}>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Approvals</TableHead>
                    <TableHead className="text-right w-56">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-12">
                        Nothing here.
                      </TableCell>
                    </TableRow>
                  ) : (
                    view.map((e) => {
                      const canApproveAsMgr =
                        user?.role !== "BILLER" &&
                        e.status === "PENDING_MANAGER" &&
                        e.createdById !== user?.id;
                      const canApproveAsAud =
                        user?.role !== "BILLER" &&
                        e.status === "PENDING_AUDITOR" &&
                        e.managerApprovedById !== user?.id &&
                        e.createdById !== user?.id;
                      const canReject =
                        user?.role !== "BILLER" && (e.status === "PENDING_MANAGER" || e.status === "PENDING_AUDITOR");
                      return (
                        <TableRow key={e.id} className={e.ownerFlagged ? "bg-rose-50/40" : ""}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(e.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                          </TableCell>
                          <TableCell>
                            <div>
                              <Badge variant="outline">{e.category}</Badge>
                            </div>
                            {e.note && <div className="text-xs text-muted-foreground mt-1">{e.note}</div>}
                          </TableCell>
                          <TableCell className="text-sm">{e.vendor ?? "—"}</TableCell>
                          <TableCell className="text-right font-medium">{inr(e.amount)}</TableCell>
                          <TableCell>
                            <Badge variant={STATUS_TONE[e.status] ?? "secondary"}>{STATUS_LABEL[e.status] ?? e.status}</Badge>
                            {e.ownerFlagged && (
                              <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-rose-700">
                                <AlertTriangle className="h-3 w-3" />
                                Owner flagged
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            <div>By: {e.createdById ? userMap.get(e.createdById)?.name ?? "—" : "—"}</div>
                            {e.managerApprovedById && (
                              <div>Mgr: {userMap.get(e.managerApprovedById)?.name ?? "—"}</div>
                            )}
                            {e.auditorApprovedById && (
                              <div>Aud: {userMap.get(e.auditorApprovedById)?.name ?? "—"}</div>
                            )}
                            {e.rejectedById && (
                              <div className="text-rose-700">
                                Rej: {userMap.get(e.rejectedById)?.name ?? "—"}
                                {e.rejectionReason && <div>"{e.rejectionReason}"</div>}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1 flex-wrap">
                              {canApproveAsMgr && <ApproveButton id={e.id} asRole="MANAGER" />}
                              {canApproveAsAud && <ApproveButton id={e.id} asRole="AUDITOR" />}
                              {canReject && <RejectButton id={e.id} />}
                              {user?.role === "OWNER" && e.ownerFlagged && <ClearFlagButton id={e.id} />}
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
        </TabsContent>
      </Tabs>

      <div className="mt-4 text-xs text-muted-foreground">
        Each expense flows: <strong>Pending manager</strong> → <strong>Pending auditor</strong> → <strong>Approved</strong>. The Manager and Auditor must be different people (and neither can be the staff member who logged it). Rejections require a reason and auto-flag to the Owner.
      </div>
    </div>
  );
}
