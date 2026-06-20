import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr, fmtDate, qtyUnit } from "@/lib/utils";
import { ArrowLeft, Trash2 } from "lucide-react";
import { WastageForm } from "./client";

export const dynamic = "force-dynamic";

export default async function WastagePage() {
  const outlet = await getActiveOutlet();
  const [rms, moves] = await Promise.all([
    db.rawMaterial.findMany({ where: { outletId: outlet.id }, orderBy: { name: "asc" } }),
    db.stockMovement.findMany({
      where: { outletId: outlet.id, reason: "WASTAGE" },
      include: { rawMaterial: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  // 7-day wastage value
  const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weekly = moves.filter((m) => m.createdAt >= week);
  const weeklyValue = weekly.reduce((s, m) => s + Math.abs(m.delta) * m.rawMaterial.avgCost, 0);

  return (
    <div>
      <PageHeader
        title="Wastage"
        description="Track raw material loss with a reason. Stock decrements and the entry shows up on movements + audit trail."
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/inventory">
              <ArrowLeft className="h-4 w-4" />
              Inventory
            </Link>
          </Button>
        }
      />

      <StatGrid cols={3} className="mb-4">
        <StatCard label="Entries (7 days)" value={weekly.length} />
        <StatCard label="Value lost (7 days)" value={inr(weeklyValue)} tone="bad" icon={<Trash2 className="h-4 w-4" />} />
        <StatCard label="Entries (all time)" value={moves.length} />
      </StatGrid>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Record wastage</CardTitle>
            <CardDescription>Pick a raw material and explain why.</CardDescription>
          </CardHeader>
          <CardContent>
            <WastageForm rms={rms.map((r) => ({ id: r.id, name: r.name, unit: r.unit, currentQty: r.currentQty }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent wastage</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {moves.length === 0 ? (
              <Empty icon={Trash2} title="No wastage recorded yet" desc="Record a loss on the left and it shows up here and on the movements audit trail." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Raw material</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {moves.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(m.createdAt, "datetime")}</TableCell>
                      <TableCell className="font-medium">{m.rawMaterial.name}</TableCell>
                      <TableCell className="text-right font-mono text-rose-700">
                        {qtyUnit(m.delta, m.rawMaterial.unit)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="destructive" className="text-[10px]">
                          {inr(Math.abs(m.delta) * m.rawMaterial.avgCost)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">
                        {m.note ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
