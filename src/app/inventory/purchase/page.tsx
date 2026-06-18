import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { Plus, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "secondary" | "info" | "success" | "destructive" | "warning"> = {
  DRAFT: "secondary",
  PENDING_CC_APPROVAL: "warning",
  APPROVED: "info",
  REJECTED: "destructive",
  SENT: "info",
  PARTIALLY_RECEIVED: "warning",
  CLOSED: "success",
  RECEIVED: "success", // legacy
  CANCELLED: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_CC_APPROVAL: "Pending CC",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SENT: "Sent",
  PARTIALLY_RECEIVED: "Partial GRN",
  CLOSED: "Closed",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

const TABS = [
  { key: "ALL", label: "All", filter: null as null | string[] },
  { key: "PENDING_CC", label: "Pending CC", filter: ["PENDING_CC_APPROVAL"] },
  { key: "READY_TO_SEND", label: "Approved", filter: ["APPROVED"] },
  { key: "OPEN", label: "Sent / Receiving", filter: ["SENT", "PARTIALLY_RECEIVED"] },
  { key: "DRAFT", label: "Draft", filter: ["DRAFT"] },
  { key: "CLOSED", label: "Closed", filter: ["CLOSED", "RECEIVED"] },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function POListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tab?: TabKey; batch?: string }>;
}) {
  const sp = await searchParams;
  // Backwards-compat: ?status=pending-cc lands on the CC queue (used by the
  // CC role's post-login redirect).
  const tab: TabKey =
    sp.status === "pending-cc" ? "PENDING_CC" : ((sp.tab as TabKey) ?? "ALL");
  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0];
  const outlet = await getActiveOutlet();
  // If the SM just landed here from the auto-PO picker, fetch the
  // freshly-created drafts grouped under this batchKey so the banner
  // tells them what to review next.
  const batchPos = sp.batch
    ? await db.purchaseOrder.findMany({
        where: { outletId: outlet.id, batchKey: sp.batch },
        include: { supplier: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const where = {
    outletId: outlet.id,
    ...(activeTab.filter ? { status: { in: activeTab.filter as unknown as string[] } } : {}),
  };
  const [pos, counts] = await Promise.all([
    db.purchaseOrder.findMany({
      where,
      include: { supplier: true, lines: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    Promise.all(
      TABS.map(async (t) => ({
        key: t.key,
        n: await db.purchaseOrder.count({
          where: {
            outletId: outlet.id,
            ...(t.filter ? { status: { in: t.filter as unknown as string[] } } : {}),
          },
        }),
      }))
    ),
  ]);
  const countByKey = Object.fromEntries(counts.map((c) => [c.key, c.n]));

  const draftValue = pos.filter((p) => p.status === "DRAFT").reduce((s, p) => s + p.grandTotal, 0);
  const inFlightValue = pos
    .filter((p) => ["SENT", "PARTIALLY_RECEIVED", "APPROVED"].includes(p.status))
    .reduce((s, p) => s + p.grandTotal, 0);

  return (
    <div>
      <PageHeader
        title="Purchase orders"
        description={`${inr(inFlightValue)} in flight · ${inr(draftValue)} in draft`}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/inventory">
                <ArrowLeft className="h-4 w-4" />
                Inventory
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/inventory/purchase/new">
                <Plus className="h-4 w-4" />
                New PO
              </Link>
            </Button>
          </>
        }
      />

      {/* Auto-PO batch banner — shown when the SM just landed from
          /inventory/purchase/new with a batchKey in the URL. Lists the
          freshly-created POs (now submitted straight to CC, not drafts)
          so the SM can confirm what went where. */}
      {batchPos.length > 0 && (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-3 mb-3">
          <div className="text-sm font-semibold text-primary mb-1.5">
            {batchPos.length} PO{batchPos.length === 1 ? "" : "s"} submitted — Cost Controller will review {batchPos.length === 1 ? "it" : "them"} next
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {batchPos.map((p) => (
              <Link
                key={p.id}
                href={`/inventory/purchase/${p.id}`}
                className="rounded-md border bg-card hover:bg-accent/40 p-2 text-sm flex items-center justify-between"
              >
                <div>
                  <div className="font-mono text-xs">{p.poNo}</div>
                  <div className="text-[11px] text-muted-foreground">{p.supplier?.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{inr(p.grandTotal)}</div>
                  <div className="text-[10px] text-muted-foreground">{STATUS_LABEL[p.status] ?? p.status} →</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {TABS.map((t) => {
          const active = t.key === activeTab.key;
          const n = countByKey[t.key] ?? 0;
          return (
            <Link
              key={t.key}
              href={t.key === "ALL" ? "/inventory/purchase" : `/inventory/purchase?tab=${t.key}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"
              }`}
            >
              {t.label}
              <Badge variant="outline" className="text-[10px] bg-background/50">
                {n}
              </Badge>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO No.</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-12">
                    No purchase orders yet. Create one to procure raw materials from a supplier.
                  </TableCell>
                </TableRow>
              ) : (
                pos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.poNo}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(p.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </TableCell>
                    <TableCell>{p.supplier.name}</TableCell>
                    <TableCell className="text-right">{p.lines.length}</TableCell>
                    <TableCell className="text-right font-medium">{inr(p.grandTotal)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_TONE[p.status] ?? "secondary"}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/inventory/purchase/${p.id}`}>Open</Link>
                      </Button>
                    </TableCell>
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
