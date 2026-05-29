import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { Empty } from "@/components/ui/empty";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import {
  NewTaskDialog,
  NewTemplateDialog,
  CompleteButton,
  DeleteTaskButton,
  DeleteTemplateButton,
} from "./client";
import { ensureDailyDuties } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "warning" | "info" | "success" | "destructive" | "secondary"> = {
  OPEN: "warning",
  IN_PROGRESS: "info",
  DONE: "success",
  CANCELLED: "secondary",
  OVERDUE: "destructive",
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireUser("BILLER");
  const sp = await searchParams;
  const outlet = await getActiveOutlet();
  await ensureDailyDuties();

  const [tasks, templates, users] = await Promise.all([
    db.task.findMany({
      where: { outletId: outlet.id, status: { not: "DONE" } },
      include: { template: true, assignedTo: true, createdBy: true },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
    db.taskTemplate.findMany({
      where: { outletId: outlet.id },
      orderBy: { createdAt: "asc" },
    }),
    db.user.findMany({
      where: { outletId: outlet.id, active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Mark overdue
  const now = Date.now();
  const open = tasks.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS");
  const overdue = open.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < now);

  return (
    <div>
      <PageHeader
        title="Tasks"
        description={`${open.length} open · ${overdue.length} overdue · ${templates.length} recurring template${templates.length === 1 ? "" : "s"}`}
        actions={
          <>
            <NewTemplateDialog>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4" />
                Recurring duty
              </Button>
            </NewTemplateDialog>
            <NewTaskDialog users={users.map((u) => ({ id: u.id, name: u.name, role: u.role }))}>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Ad-hoc task
              </Button>
            </NewTaskDialog>
          </>
        }
      />

      <Tabs defaultValue={sp.tab ?? "open"}>
        <TabsList>
          <TabsTrigger value="open">Open ({open.length})</TabsTrigger>
          <TabsTrigger value="overdue">Overdue ({overdue.length})</TabsTrigger>
          <TabsTrigger value="templates">Templates ({templates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="open">
          {open.length === 0 ? (
            <Card>
              <CardContent>
                <Empty
                  title="No open tasks"
                  desc="Use Ad-hoc task to log issues or duties not in the recurring schedule."
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right w-32">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {open.map((t) => {
                      const isOverdue = t.dueAt && new Date(t.dueAt).getTime() < now;
                      return (
                        <TableRow key={t.id}>
                          <TableCell>
                            <div className="font-medium">{t.title}</div>
                            {t.description && (
                              <div className="text-xs text-muted-foreground truncate max-w-[400px]">
                                {t.description}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {t.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {t.assignedTo?.name ?? t.assignedRole ?? <span className="text-muted-foreground">Anyone</span>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {t.dueAt ? new Date(t.dueAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={isOverdue ? "destructive" : STATUS_TONE[t.status] ?? "secondary"}>
                              {isOverdue ? "OVERDUE" : t.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <CompleteButton id={t.id} title={t.title} />
                              <DeleteTaskButton id={t.id} title={t.title} />
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
        </TabsContent>

        <TabsContent value="overdue">
          {overdue.length === 0 ? (
            <Card>
              <CardContent>
                <Empty title="Nothing overdue" desc="Keep it that way." />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Was due</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead className="text-right w-32">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overdue.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.title}</TableCell>
                        <TableCell className="text-xs text-rose-700">
                          {new Date(t.dueAt!).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </TableCell>
                        <TableCell className="text-sm">{t.assignedTo?.name ?? t.assignedRole ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <CompleteButton id={t.id} title={t.title} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="templates">
          {templates.length === 0 ? (
            <Card>
              <CardContent>
                <Empty
                  title="No recurring duties yet"
                  desc="Create a daily duty (e.g. Day-end stock count, Cash drawer reconciliation) and the system auto-generates it every day."
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Cadence</TableHead>
                      <TableHead>Default role</TableHead>
                      <TableHead>SLA</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last generated</TableHead>
                      <TableHead className="text-right w-32">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <div className="font-medium">{t.title}</div>
                          {t.description && (
                            <div className="text-xs text-muted-foreground truncate max-w-[400px]">{t.description}</div>
                          )}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{t.cadence}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{t.defaultRole ?? "Any"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{t.slaMinutes ? `${t.slaMinutes}m` : "—"}</TableCell>
                        <TableCell>
                          {t.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Paused</Badge>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {t.lastRunAt ? new Date(t.lastRunAt).toLocaleString("en-IN", { day: "2-digit", month: "short" }) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <NewTemplateDialog
                              initial={{
                                id: t.id,
                                title: t.title,
                                description: t.description ?? "",
                                cadence: t.cadence as any,
                                defaultRole: (t.defaultRole as any) ?? "",
                                slaMinutes: t.slaMinutes ?? 0,
                                active: t.active,
                              }}
                            >
                              <Button variant="ghost" size="sm">Edit</Button>
                            </NewTemplateDialog>
                            <DeleteTemplateButton id={t.id} title={t.title} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <div className="mt-4 text-xs text-muted-foreground">
        Recurring duties auto-generate once per cadence per outlet. Tasks not completed by their due time flip to <strong>OVERDUE</strong> and surface in the overdue tab.
      </div>
    </div>
  );
}
