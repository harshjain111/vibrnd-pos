import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import { CashEntryDialog } from "./client";
import { deleteCashEntry } from "./actions";

export const dynamic = "force-dynamic";

const KIND_TONE: Record<string, "info" | "success" | "destructive"> = {
  OPENING: "info",
  TOP_UP: "success",
  WITHDRAWAL: "destructive",
};

export default async function CashPage() {
  const outlet = await getActiveOutlet();
  // Today's window
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [entries, ordersToday] = await Promise.all([
    db.cashEntry.findMany({
      where: { outletId: outlet.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.order.findMany({
      where: {
        outletId: outlet.id,
        createdAt: { gte: today },
        status: { in: ["PAID", "PRINTED"] },
      },
    }),
  ]);

  // Today's expected counter cash = OPENING + TOP_UP - WITHDRAWAL + cash sales
  const todaysEntries = entries.filter((e) => e.createdAt >= today);
  const opening = todaysEntries.filter((e) => e.kind === "OPENING").reduce((s, e) => s + e.amount, 0);
  const topUps = todaysEntries.filter((e) => e.kind === "TOP_UP").reduce((s, e) => s + e.amount, 0);
  const withdrawals = todaysEntries.filter((e) => e.kind === "WITHDRAWAL").reduce((s, e) => s + e.amount, 0);
  const cashSales = ordersToday.filter((o) => o.paymentMode === "CASH").reduce((s, o) => s + o.grandTotal, 0);
  const expectedCash = opening + topUps - withdrawals + cashSales;

  return (
    <div>
      <PageHeader
        title="Cash management"
        description="Track opening cash, drawer top-ups, and withdrawals — separate from expenses."
        actions={
          <CashEntryDialog>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New entry
            </Button>
          </CashEntryDialog>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Kpi label="Opening today" value={inr(opening)} />
        <Kpi label="Cash sales today" value={inr(cashSales)} tone="good" />
        <Kpi label="Top-ups today" value={inr(topUps)} tone="good" />
        <Kpi label="Withdrawals today" value={inr(withdrawals)} tone="bad" />
        <Kpi label="Expected drawer" value={inr(expectedCash)} tone="primary" />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead className="text-right w-16">Del</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-12">
                    No cash entries yet. Start the day with an OPENING entry.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={KIND_TONE[e.kind] ?? "secondary"}>{e.kind}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{inr(e.amount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.reason ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{e.actor}</TableCell>
                    <TableCell className="text-right">
                      <form action={deleteCashEntry}>
                        <input type="hidden" name="id" value={e.id} />
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </form>
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

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "primary" }) {
  const colors: Record<string, string> = { good: "text-emerald-700", bad: "text-rose-700", primary: "text-primary" };
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-xl font-semibold mt-0.5 ${tone ? colors[tone] : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
