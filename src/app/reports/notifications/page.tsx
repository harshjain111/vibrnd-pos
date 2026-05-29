import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { Plus } from "lucide-react";
import { ToggleStatusBtn, DeleteNotificationBtn, SendNowBtn } from "./client";
import { findReport } from "../registry";

export const dynamic = "force-dynamic";

export default async function NotificationsList() {
  const outlet = await getActiveOutlet();
  const rows = await db.reportNotification.findMany({
    where: { outletId: outlet.id },
    include: { logs: { take: 1, orderBy: { sentAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <PageHeader
        title="Report Notifications"
        description="Schedule any report to be emailed automatically. Daily / Weekly / Monthly cadence."
        actions={
          <Link href="/reports/notifications/new">
            <Button size="sm"><Plus className="h-4 w-4" />New schedule</Button>
          </Link>
        }
      />
      {rows.length === 0 ? (
        <Card><CardContent><Empty title="No scheduled reports" desc="Tap New schedule to email a report on a cadence." /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Report</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Range</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last sent</TableHead>
                  <TableHead className="text-right w-44">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const reg = findReport(r.slug);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-xs">{reg?.name ?? r.slug}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.recipients.split(",").map((e) => e.trim()).join(", ")}
                      </TableCell>
                      <TableCell className="text-xs">{r.frequency}</TableCell>
                      <TableCell className="text-xs font-mono">{r.time}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{r.format}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{r.dateRange.replace("_", " ").toLowerCase()}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "ACTIVE" ? "success" : "secondary"} className="text-[10px]">
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.logs[0]
                          ? r.logs[0].sentAt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <SendNowBtn id={r.id} />
                          <ToggleStatusBtn id={r.id} status={r.status as "ACTIVE" | "INACTIVE"} />
                          <Link href={`/reports/notifications/${r.id}`}>
                            <Button variant="ghost" size="sm">Edit</Button>
                          </Link>
                          <DeleteNotificationBtn id={r.id} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
