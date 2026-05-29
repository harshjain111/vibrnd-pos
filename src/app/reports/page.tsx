import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Empty } from "@/components/ui/empty";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { db } from "@/lib/db";
import { Bell, Calendar, Star } from "lucide-react";
import { REPORT_TABS, REPORTS, byTab } from "./registry";
import { FavouriteStar } from "./client";

export const dynamic = "force-dynamic";

export default async function ReportsHub({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser("MANAGER");
  const sp = await searchParams;
  const user = await getSessionUser();
  const favs = user
    ? new Set((await db.reportFavourite.findMany({ where: { userId: user.id } })).map((f) => f.slug))
    : new Set<string>();
  const search = (sp.q ?? "").toLowerCase().trim();

  const totalCount = REPORTS.length;
  const implementedCount = REPORTS.filter((r) => r.implemented).length;

  return (
    <div>
      <PageHeader
        title="Reports"
        description={`${implementedCount} of ${totalCount} reports live · favourites are per-user`}
        actions={
          <>
            <Link href="/reports/day-end">
              <Button variant="outline" size="sm">
                <Calendar className="h-4 w-4" />
                Day End Summary
              </Button>
            </Link>
            <Link href="/reports/notifications">
              <Button size="sm">
                <Bell className="h-4 w-4" />
                Scheduled emails
              </Button>
            </Link>
          </>
        }
      />

      <form className="mb-3" action="/reports" method="GET">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search reports by name…"
          className="h-9 w-full md:max-w-sm rounded-md border bg-background px-3 text-sm"
        />
      </form>

      <Tabs defaultValue={favs.size > 0 ? "favourite" : "all_restaurant"}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="favourite">
            <Star className="h-3.5 w-3.5 mr-1" />
            Favourite ({favs.size})
          </TabsTrigger>
          {REPORT_TABS.map((t) => {
            const count = byTab(t.id).length;
            return (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label} ({count})
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="favourite">
          {favs.size === 0 ? (
            <Card>
              <CardContent>
                <Empty
                  title="There are no favourite reports"
                  desc="Star the reports you check often — they'll appear here."
                />
              </CardContent>
            </Card>
          ) : (
            <CardGrid
              reports={REPORTS.filter((r) => favs.has(r.slug) && (!search || r.name.toLowerCase().includes(search)))}
              favs={favs}
            />
          )}
        </TabsContent>

        {REPORT_TABS.map((t) => (
          <TabsContent key={t.id} value={t.id}>
            <CardGrid
              reports={byTab(t.id).filter((r) => !search || r.name.toLowerCase().includes(search))}
              favs={favs}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function CardGrid({
  reports,
  favs,
}: {
  reports: typeof REPORTS;
  favs: Set<string>;
}) {
  if (reports.length === 0) {
    return (
      <Card>
        <CardContent>
          <Empty title="No Record Found" desc="Try clearing the search or pick another tab." />
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {reports.map((r) => (
        <Card key={r.slug} className={`hover:border-primary hover:shadow-sm transition-all h-full ${r.implemented ? "" : "opacity-70"}`}>
          <CardContent className="p-4 flex items-start gap-3">
            <FavouriteStar slug={r.slug} isFav={favs.has(r.slug)} />
            <div className="min-w-0 flex-1">
              <Link href={`/reports/${r.slug}`} className="block">
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{r.desc}</div>
                <div className="mt-1.5 flex gap-1.5 flex-wrap">
                  {r.topTwelve && <Badge variant="warning" className="text-[10px]">Top 12</Badge>}
                  {!r.implemented && <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>}
                  {r.implemented && <Badge variant="success" className="text-[10px]">Live</Badge>}
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
