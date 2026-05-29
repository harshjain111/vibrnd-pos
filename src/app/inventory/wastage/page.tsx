import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
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

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <Kpi label="Entries (7 days)" value={String(weekly.length)} />
        <Kpi label="Value lost (7 days)" value={inr(weeklyValue)} tone="bad" />
        <Kpi label="Entries (all time)" value={String(moves.length)} />
      </div>

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
                {moves.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-12">
                      No wastage recorded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  moves.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(m.createdAt).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="font-medium">{m.rawMaterial.name}</TableCell>
                      <TableCell className="text-right font-mono text-rose-700">
                        {m.delta.toFixed(2)} {m.rawMaterial.unit}
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
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-xl font-semibold mt-0.5 ${tone === "bad" ? "text-rose-700" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
