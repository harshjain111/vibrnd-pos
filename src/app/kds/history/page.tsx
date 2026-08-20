import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { ArrowLeft } from "lucide-react";
import { ensureKitchens } from "@/lib/kds/loader";
import { renderComment, parseComments } from "@/lib/kds/comments";

export const dynamic = "force-dynamic";

// KDS v2 History — spec §15. Read from the event log so it can't
// disagree with reality. Default view: today, this kitchen. Filters
// (all-kitchens, cancelled-only, remade-only) are additive follow-ups.
export default async function KdsHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ kitchen?: string; q?: string }>;
}) {
  await requireUser("BILLER");
  const sp = await searchParams;
  const outlet = await getActiveOutlet();
  const kitchens = await ensureKitchens(outlet.id);
  const kitchen = kitchens.find((k) => k.code === sp.kitchen) ?? kitchens[0];
  const search = (sp.q ?? "").trim();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Every KOT that has at least one item routed to this kitchen and has
  // left the board (cleared, settled or fully cancelled), newest first.
  const rows = await db.kitchenTicket.findMany({
    where: {
      outletId: outlet.id,
      OR: [
        { clearedAt: { gte: startOfDay } },
        { status: "CANCELLED" },
        { readyAt: { gte: startOfDay } },
      ],
      lines: { some: { kitchenId: kitchen.id } },
      ...(search
        ? {
            OR: [
              { kotNo: { contains: search, mode: "insensitive" } },
              { tableLabel: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      lines: {
        where: { kitchenId: kitchen.id },
        orderBy: { updatedAt: "asc" },
      },
      order: { select: { table: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title={`${kitchen.name} · History`}
        description="Every finished, cancelled and settled ticket for today. Read from the event log — can never disagree with reality."
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/kds?kitchen=${kitchen.code}`}>
                <ArrowLeft className="h-4 w-4" />
                Back to board
              </Link>
            </Button>
            {kitchens.length > 1 && (
              <div className="flex items-center gap-1 text-xs">
                {kitchens.map((k) => (
                  <Link
                    key={k.id}
                    href={{ pathname: "/kds/history", query: { kitchen: k.code, ...(sp.q ? { q: sp.q } : {}) } }}
                    className={
                      "rounded-md border px-2 py-0.5 " +
                      (k.id === kitchen.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")
                    }
                  >
                    {k.name}
                  </Link>
                ))}
              </div>
            )}
          </>
        }
      />

      <form className="mb-3">
        <input
          type="search"
          name="q"
          placeholder="Search KOT number or table…"
          defaultValue={search}
          className="w-full max-w-md rounded-md border px-3 py-1.5 text-sm"
        />
        {sp.kitchen && <input type="hidden" name="kitchen" value={sp.kitchen} />}
      </form>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <Empty
              title="Nothing in history yet today"
              desc="Served, settled and cancelled tickets show up here as they leave the board."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>KOT</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Items & comments</TableHead>
                  <TableHead>Took</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((k) => {
                  const status = describeStatus(k);
                  const took = describeTook(k);
                  return (
                    <TableRow key={k.id}>
                      <TableCell className="font-mono text-xs">{k.kotNo}</TableCell>
                      <TableCell className="text-sm">
                        {k.tableLabel ?? k.order.table?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="space-y-1">
                          {k.lines.map((l) => (
                            <div key={l.id} className={l.status === "CANCELLED" ? "line-through opacity-70" : ""}>
                              <b>{l.qty}×</b> {l.name}
                              {parseComments(l.comments).length > 0 && (
                                <span className="ml-2 text-amber-800">
                                  {parseComments(l.comments).map((c) => renderComment(c)).join(" · ")}
                                </span>
                              )}
                              {l.status === "CANCELLED" && l.cancelReason && (
                                <span className="ml-2 text-[10px] text-rose-700 italic not-line-through">
                                  · {l.cancelReason}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{took}</TableCell>
                      <TableCell>{status}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function describeStatus(k: { status: string; clearedReason: string | null; lines: { status: string }[] }) {
  const anyCancelled = k.lines.some((l) => l.status === "CANCELLED");
  if (k.clearedReason === "SETTLED") return <Badge variant="success">Settled</Badge>;
  if (k.clearedReason === "BUMPED") return <Badge variant="secondary">Bumped</Badge>;
  if (anyCancelled) return <Badge variant="destructive">Cancelled</Badge>;
  return <Badge variant="info">Cleared</Badge>;
}

function describeTook(k: { readyAt: Date | null; servedAt: Date | null; punchedAt: Date | null; createdAt: Date }) {
  const start = k.punchedAt ?? k.createdAt;
  const end = k.servedAt ?? k.readyAt;
  if (!end) return "—";
  const secs = Math.floor((end.getTime() - start.getTime()) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
