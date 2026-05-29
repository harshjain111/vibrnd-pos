import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { Plus, Star } from "lucide-react";
import { FeedbackDialog, ResolveDialog, DeleteFeedbackButton } from "./client";

export const dynamic = "force-dynamic";

const CATEGORY_TONE: Record<string, "info" | "success" | "warning" | "destructive" | "secondary"> = {
  FOOD: "success",
  SERVICE: "info",
  AMBIANCE: "secondary",
  DELIVERY: "warning",
  OTHER: "secondary",
};

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const outlet = await getActiveOutlet();
  const filter = sp.filter ?? "open";

  const where: any = { outletId: outlet.id };
  if (filter === "open") where.resolved = false;
  else if (filter === "resolved") where.resolved = true;
  // "all" → no filter

  const list = await db.feedback.findMany({
    where,
    include: { customer: true, order: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const totalOpen = await db.feedback.count({ where: { outletId: outlet.id, resolved: false } });
  const totalAll = await db.feedback.count({ where: { outletId: outlet.id } });

  // Average rating (across all)
  const allRatings = await db.feedback.findMany({
    where: { outletId: outlet.id },
    select: { rating: true },
  });
  const avg = allRatings.length ? allRatings.reduce((s, r) => s + r.rating, 0) / allRatings.length : 0;
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>;
  for (const r of allRatings) counts[r.rating] = (counts[r.rating] ?? 0) + 1;

  return (
    <div>
      <PageHeader
        title="Feedback"
        description={`${totalAll} entries · ${totalOpen} open · average ${avg.toFixed(1)}★`}
        actions={
          <FeedbackDialog>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Capture feedback
            </Button>
          </FeedbackDialog>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[5, 4, 3, 2, 1].map((s) => (
          <Card key={s}>
            <CardContent className="p-3">
              <div className="inline-flex items-center gap-1 text-amber-600 mb-0.5">
                {Array.from({ length: s }).map((_, i) => (
                  <Star key={i} className="h-3 w-3 fill-amber-500" />
                ))}
              </div>
              <div className="text-xl font-semibold">{counts[s] ?? 0}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue={filter}>
        <TabsList>
          <TabsTrigger value="open" asChild>
            <Link href="/feedback?filter=open">Open ({totalOpen})</Link>
          </TabsTrigger>
          <TabsTrigger value="resolved" asChild>
            <Link href="/feedback?filter=resolved">Resolved</Link>
          </TabsTrigger>
          <TabsTrigger value="all" asChild>
            <Link href="/feedback?filter=all">All ({totalAll})</Link>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={filter}>
          {list.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nothing to show.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {list.map((f) => (
                <Card key={f.id} className={f.resolved ? "opacity-70" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={CATEGORY_TONE[f.category] ?? "secondary"}>{f.category}</Badge>
                        <div className="inline-flex items-center gap-0.5 text-amber-500">
                          {Array.from({ length: f.rating }).map((_, i) => (
                            <Star key={i} className="h-3.5 w-3.5 fill-amber-500" />
                          ))}
                          {Array.from({ length: 5 - f.rating }).map((_, i) => (
                            <Star key={`empty-${i}`} className="h-3.5 w-3.5 text-muted/40" />
                          ))}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(f.createdAt).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm pt-0">
                    {f.text && <p>{f.text}</p>}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {f.customer && (
                        <span>
                          From <Link href={`/customers/${f.customer.id}`} className="hover:underline">{f.customer.name}</Link>
                        </span>
                      )}
                      {f.order && (
                        <span>
                          Order <Link href={`/orders/${f.order.id}`} className="font-mono hover:underline">{f.order.invoiceNo}</Link>
                        </span>
                      )}
                      {!f.customer && !f.order && <span>Anonymous</span>}
                    </div>
                    {f.resolved && f.resolvedNote && (
                      <div className="text-xs bg-emerald-50 border border-emerald-200 rounded px-2 py-1 text-emerald-800">
                        Resolved: {f.resolvedNote}
                      </div>
                    )}
                    <div className="flex justify-end gap-1 pt-2">
                      {!f.resolved && <ResolveDialog id={f.id} />}
                      <DeleteFeedbackButton id={f.id} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
