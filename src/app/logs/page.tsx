import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { Search } from "lucide-react";
import { requireUser } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const ACTION_TONE: Record<string, "success" | "info" | "warning" | "destructive" | "secondary"> = {
  CREATE: "success",
  UPDATE: "info",
  SETTLE: "success",
  ACCEPT: "success",
  ADVANCE: "info",
  DELETE: "destructive",
  CANCEL: "destructive",
  REJECT: "destructive",
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; q?: string }>;
}) {
  await requireUser("MANAGER");
  const sp = await searchParams;
  const outlet = await getActiveOutlet();

  const where: any = { outletId: outlet.id };
  if (sp.entity && sp.entity !== "all") where.entity = sp.entity;
  if (sp.q) where.summary = { contains: sp.q, mode: "insensitive" };

  const logs = await db.activityLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  // Friendlier labels per audit B12 — internal entity name stays the same in the URL/value.
  const entities: { value: string; label: string }[] = [
    { value: "Order", label: "Order" },
    { value: "KOT", label: "KOT" },
    { value: "Item", label: "Item" },
    { value: "Discount", label: "Discount" },
    { value: "Customer", label: "Customer" },
    { value: "RawMaterial", label: "Raw Material" },
    { value: "Outlet", label: "Outlet" },
    { value: "Expense", label: "Expense" },
    { value: "Table", label: "Dining Table" },
    { value: "Purchase", label: "Purchase" },
    { value: "Transfer", label: "Transfer" },
    { value: "StockCount", label: "Stock Count" },
    { value: "ReportNotification", label: "Scheduled Report" },
  ];

  return (
    <div>
      <PageHeader
        title="Audit trail"
        description={`${logs.length} events · last 300 · use filters to drill in`}
      />

      <Card className="mb-3">
        <CardContent className="p-3">
          <form className="flex flex-wrap gap-2" action="/logs" method="GET">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search summary…" className="pl-8" />
            </div>
            <select
              name="entity"
              defaultValue={sp.entity ?? "all"}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">All entities</option>
              {entities.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
            <Button type="submit">Apply</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">When</TableHead>
                <TableHead className="w-28">Action</TableHead>
                <TableHead className="w-32">Entity</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead className="w-32">Actor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-12">
                    No activity yet — settle a bill, edit a menu item, or advance a KOT and it shows up here.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(l.createdAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ACTION_TONE[l.action] ?? "secondary"}>{l.action}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{l.entity}</TableCell>
                    <TableCell>{l.summary}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{l.actor}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
