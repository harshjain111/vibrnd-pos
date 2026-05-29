import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { ArrowLeft, Search } from "lucide-react";

export const dynamic = "force-dynamic";

const REASON_TONE: Record<string, "success" | "warning" | "destructive" | "info" | "secondary"> = {
  SALE: "warning",
  CANCEL_REVERSE: "success",
  ADJUST: "info",
  PURCHASE: "success",
  WASTAGE: "destructive",
  OPENING: "secondary",
};

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ rm?: string; reason?: string }>;
}) {
  const sp = await searchParams;
  const outlet = await getActiveOutlet();

  const where: any = { outletId: outlet.id };
  if (sp.rm && sp.rm !== "all") where.rawMaterialId = sp.rm;
  if (sp.reason && sp.reason !== "all") where.reason = sp.reason;

  const [movements, rms] = await Promise.all([
    db.stockMovement.findMany({
      where,
      include: { rawMaterial: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    db.rawMaterial.findMany({ where: { outletId: outlet.id }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Stock movements"
        description={`${movements.length} entries · last 300 · every inventory change is recorded here`}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/inventory">
              <ArrowLeft className="h-4 w-4" />
              Back to inventory
            </Link>
          </Button>
        }
      />

      <Card className="mb-3">
        <CardContent className="p-3">
          <form className="flex gap-2 flex-wrap" action="/inventory/movements" method="GET">
            <select
              name="rm"
              defaultValue={sp.rm ?? "all"}
              className="h-9 rounded-md border bg-background px-3 text-sm min-w-[200px]"
            >
              <option value="all">All raw materials</option>
              {rms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <select
              name="reason"
              defaultValue={sp.reason ?? "all"}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">All reasons</option>
              <option value="SALE">Sale</option>
              <option value="CANCEL_REVERSE">Cancel reverse</option>
              <option value="ADJUST">Adjust</option>
              <option value="PURCHASE">Purchase</option>
              <option value="WASTAGE">Wastage</option>
              <option value="OPENING">Opening</option>
            </select>
            <Button type="submit">Apply</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">When</TableHead>
                <TableHead>Raw material</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Δ</TableHead>
                <TableHead className="text-right">Before</TableHead>
                <TableHead className="text-right">After</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-12">
                    No movements yet — settle a bill, cancel an order, or adjust stock and entries show up here.
                  </TableCell>
                </TableRow>
              ) : (
                movements.map((m) => {
                  const positive = m.delta > 0;
                  return (
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
                      <TableCell>
                        <Badge variant={REASON_TONE[m.reason] ?? "secondary"}>{m.reason}</Badge>
                      </TableCell>
                      <TableCell className={`text-right font-mono ${positive ? "text-emerald-700" : "text-rose-700"}`}>
                        {positive ? "+" : ""}
                        {m.delta.toFixed(2)} {m.rawMaterial.unit}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {m.qtyBefore.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-medium">{m.qtyAfter.toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.refType && (
                          <span>
                            {m.refType}
                            {m.refId && <span className="font-mono ml-1">{m.refId.slice(0, 8)}</span>}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">
                        {m.note ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
