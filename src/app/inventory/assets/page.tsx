import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { inr } from "@/lib/utils";
import { ClipboardCheck, Plus, Sofa, AlertTriangle, Boxes } from "lucide-react";
import { AssetDialog, DeleteAssetBtn } from "./client";

export const dynamic = "force-dynamic";

const CATEGORIES = ["FURNITURE", "KITCHEN", "ELECTRONICS", "DECOR", "OTHER"] as const;

export default async function FixedAssetsPage() {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const [assets, recentAudits] = await Promise.all([
    db.fixedAsset.findMany({
      where: { outletId: outlet.id, active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    db.assetAudit.findMany({
      where: { outletId: outlet.id },
      orderBy: { auditedAt: "desc" },
      take: 10,
    }),
  ]);

  const totalUnits = assets.reduce((s, a) => s + a.qty, 0);
  const totalValue = assets.reduce((s, a) => s + a.qty * a.unitValue, 0);
  const damaged = assets.filter((a) => a.condition === "DAMAGED").length;
  const lastAudit = recentAudits[0];

  const byCategory = new Map<string, typeof assets>();
  for (const a of assets) {
    const arr = byCategory.get(a.category) ?? [];
    arr.push(a);
    byCategory.set(a.category, arr);
  }

  return (
    <div>
      <PageHeader
        title="Fixed Assets"
        description="Tables, chairs, sofas, kitchen units — everything that doesn't come through purchases. Audit periodically to catch theft or damage."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/inventory/assets/audits">All audits</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/inventory/assets/audits/new">
                <ClipboardCheck className="h-4 w-4" />
                Start audit
              </Link>
            </Button>
            <AssetDialog>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4" />
                Add asset
              </Button>
            </AssetDialog>
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi label="Total items" value={String(assets.length)} Icon={Boxes} />
        <Kpi label="Total units" value={String(totalUnits)} />
        <Kpi label="Book value" value={inr(Math.round(totalValue))} tone="good" />
        <Kpi
          label={damaged > 0 ? "Damaged units" : "Last audit"}
          value={
            damaged > 0
              ? String(damaged)
              : lastAudit
                ? lastAudit.auditedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
                : "Never"
          }
          tone={damaged > 0 ? "bad" : "neutral"}
          Icon={damaged > 0 ? AlertTriangle : ClipboardCheck}
        />
      </div>

      {assets.length === 0 ? (
        <Card>
          <CardContent>
            <Empty
              title="No fixed assets logged yet"
              desc="Add your tables, chairs, sofas etc. so you have a source-of-truth to audit against."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {CATEGORIES.filter((c) => byCategory.has(c)).map((cat) => {
            const rows = byCategory.get(cat)!;
            return (
              <Card key={cat}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base inline-flex items-center gap-2">
                    <Sofa className="h-4 w-4" />
                    {labelFor(cat)} <Badge variant="outline" className="text-[10px]">{rows.length} type{rows.length === 1 ? "" : "s"}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit ₹</TableHead>
                        <TableHead>Condition</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="text-right w-28">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{a.location ?? "—"}</TableCell>
                          <TableCell className="text-right font-semibold">{a.qty}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {a.unitValue ? inr(a.unitValue) : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                a.condition === "GOOD"
                                  ? "success"
                                  : a.condition === "FAIR"
                                    ? "secondary"
                                    : a.condition === "DAMAGED"
                                      ? "warning"
                                      : "destructive"
                              }
                              className="text-[10px]"
                            >
                              {a.condition}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">
                            {a.notes ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex gap-1">
                              <AssetDialog
                                initial={{
                                  id: a.id,
                                  name: a.name,
                                  category: a.category as "FURNITURE" | "KITCHEN" | "ELECTRONICS" | "DECOR" | "OTHER",
                                  location: a.location ?? "",
                                  qty: a.qty,
                                  unitValue: a.unitValue,
                                  condition: a.condition as "GOOD" | "FAIR" | "DAMAGED" | "DISCARDED",
                                  purchasedAt: a.purchasedAt ? a.purchasedAt.toISOString().slice(0, 10) : "",
                                  notes: a.notes ?? "",
                                }}
                              >
                                <Button variant="ghost" size="sm">Edit</Button>
                              </AssetDialog>
                              <DeleteAssetBtn id={a.id} />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}

          {recentAudits.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recent audits</CardTitle>
                <CardDescription>Click any audit to see the variance breakdown</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Lines checked</TableHead>
                      <TableHead>Variance</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentAudits.map((a) => (
                      <TableRow key={a.id} className="cursor-pointer hover:bg-accent/40">
                        <TableCell className="text-xs text-muted-foreground">
                          <Link href={`/inventory/assets/audits/${a.id}`} className="hover:underline">
                            {a.auditedAt.toLocaleString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">—</TableCell>
                        <TableCell>
                          {a.varianceLines > 0 ? (
                            <Badge variant="destructive" className="text-[10px]">
                              {a.varianceLines} flagged
                            </Badge>
                          ) : (
                            <Badge variant="success" className="text-[10px]">all match</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">
                          {a.notes ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function labelFor(cat: string) {
  return cat.charAt(0) + cat.slice(1).toLowerCase();
}

function Kpi({
  label,
  value,
  tone,
  Icon,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
  Icon?: React.ComponentType<{ className?: string }>;
}) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {label}
        </div>
        <div className={`text-2xl font-semibold mt-0.5 ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
