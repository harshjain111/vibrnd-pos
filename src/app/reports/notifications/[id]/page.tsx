import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { REPORTS } from "../../registry";
import { NotificationForm } from "../form";

export const dynamic = "force-dynamic";

export default async function EditNotificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = await db.reportNotification.findUnique({
    where: { id },
    include: { logs: { orderBy: { sentAt: "desc" }, take: 20 } },
  });
  if (!n) return notFound();
  return (
    <div>
      <PageHeader title={`Edit · ${n.name}`} description="Update schedule or recipients." />
      <Card className="mb-3">
        <CardContent className="p-4">
          <NotificationForm
            reports={REPORTS.filter((r) => r.implemented).map((r) => ({ slug: r.slug, name: r.name }))}
            initial={{
              id: n.id,
              name: n.name,
              slug: n.slug,
              recipients: n.recipients,
              status: n.status as "ACTIVE" | "INACTIVE",
              frequency: n.frequency as "DAILY" | "WEEKLY" | "MONTHLY",
              time: n.time,
              dayOfWeek: n.dayOfWeek ?? "",
              dayOfMonth: n.dayOfMonth ?? undefined,
              format: n.format as "EXCEL" | "PDF" | "BOTH",
              subject: n.subject ?? "",
              dateRange: n.dateRange as "YESTERDAY" | "LAST_7" | "THIS_MONTH" | "LAST_MONTH" | "ROLLING_N",
              rollingDays: n.rollingDays ?? undefined,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sent at</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Range resolved</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {n.logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                    No deliveries yet.
                  </TableCell>
                </TableRow>
              ) : (
                n.logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {l.sentAt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={l.status === "OK" ? "success" : l.status === "RETRY" ? "warning" : "destructive"} className="text-[10px]">
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {l.resolvedFrom && l.resolvedTo
                        ? `${l.resolvedFrom.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} → ${l.resolvedTo.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-rose-700">{l.errorMsg ?? ""}</TableCell>
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
