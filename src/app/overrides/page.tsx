import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { Empty } from "@/components/ui/empty";
import { DecideButtons } from "./client";

export const dynamic = "force-dynamic";

export default async function OverridesPage() {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const list = await db.overrideRequest.findMany({
    where: { outletId: outlet.id },
    include: { requestedBy: true, approvedBy: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const pending = list.filter((r) => r.status === "PENDING");
  const resolved = list.filter((r) => r.status !== "PENDING");

  return (
    <div>
      <PageHeader
        title="Override requests"
        description={`${pending.length} pending · ${resolved.length} resolved · all overrides flow through audit log`}
      />

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="resolved">Resolved ({resolved.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {pending.length === 0 ? (
            <Card>
              <CardContent>
                <Empty
                  title="No pending overrides"
                  desc="Discount requests above your auto-approve limit, line voids, and refund requests show up here for manager review."
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Context</TableHead>
                      <TableHead>Requested by</TableHead>
                      <TableHead className="text-right w-44">Decide</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((r) => {
                      let ctx: any = {};
                      try {
                        ctx = JSON.parse(r.contextJson);
                      } catch {}
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(r.createdAt).toLocaleString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell>
                            <Badge variant="warning">{r.actionType}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{ctx.summary ?? r.contextJson.slice(0, 80)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.requestedBy?.name ?? "system"}
                          </TableCell>
                          <TableCell className="text-right">
                            <DecideButtons id={r.id} />
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

        <TabsContent value="resolved">
          {resolved.length === 0 ? (
            <Card>
              <CardContent>
                <Empty title="Nothing resolved yet" />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Context</TableHead>
                      <TableHead>Decision</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead>Resolution</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resolved.map((r) => {
                      let ctx: any = {};
                      try {
                        ctx = JSON.parse(r.contextJson);
                      } catch {}
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(r.resolvedAt ?? r.createdAt).toLocaleString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{r.actionType}</Badge>
                          </TableCell>
                          <TableCell className="text-sm max-w-[280px] truncate">
                            {ctx.summary ?? r.contextJson.slice(0, 80)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={r.status === "APPROVED" ? "success" : "destructive"}>{r.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.approvedBy?.name ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {r.resolution ?? "—"}
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
      </Tabs>

      <div className="mt-4 text-xs text-muted-foreground">
        Override requests are created when an actor needs manager approval (e.g. line-void after KOT, large discount, refund). Approving an override records who approved and stamps the linked audit entry.
      </div>
    </div>
  );
}
