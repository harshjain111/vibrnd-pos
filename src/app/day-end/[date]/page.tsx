import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { ArrowLeft, Printer } from "lucide-react";
import { notFound } from "next/navigation";
import { DenominationForm } from "./client";

export const dynamic = "force-dynamic";

export default async function DayEndDetailPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return notFound();

  const outlet = await getActiveOutlet();
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59.999`);

  const startDay = new Date(start);
  startDay.setHours(0, 0, 0, 0);
  const existingClose = await db.dayClose.findUnique({
    where: { outletId_businessDay: { outletId: outlet.id, businessDay: startDay } },
  });

  const [orders, expenses, cash, kots] = await Promise.all([
    db.order.findMany({
      where: { outletId: outlet.id, createdAt: { gte: start, lte: end } },
      include: { items: { include: { item: { include: { category: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    db.expense.findMany({
      where: { outletId: outlet.id, createdAt: { gte: start, lte: end } },
    }),
    db.cashEntry.findMany({
      where: { outletId: outlet.id, createdAt: { gte: start, lte: end } },
    }),
    db.kitchenTicket.findMany({
      where: { outletId: outlet.id, createdAt: { gte: start, lte: end } },
      select: { id: true, status: true, createdAt: true },
    }),
  ]);
  const opening = cash.filter((c) => c.kind === "OPENING").reduce((s, c) => s + c.amount, 0);
  const topUps = cash.filter((c) => c.kind === "TOP_UP").reduce((s, c) => s + c.amount, 0);
  const withdrawals = cash.filter((c) => c.kind === "WITHDRAWAL").reduce((s, c) => s + c.amount, 0);

  const paid = orders.filter((o) => o.status === "PAID" || o.status === "PRINTED");
  const sales = paid.reduce((s, o) => s + o.grandTotal, 0);
  const taxes = paid.reduce((s, o) => s + o.taxTotal, 0);
  const cancelled = orders.filter((o) => o.status === "CANCELLED").length;

  const sumByPM = (m: string) => paid.filter((o) => o.paymentMode === m).reduce((s, o) => s + o.grandTotal, 0);
  const sumByType = (t: string) => paid.filter((o) => o.orderType === t).reduce((s, o) => s + o.grandTotal, 0);

  const cashSales = sumByPM("CASH");
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  // COGS + gross margin — derived from per-line cogs snapshotted at
  // place-order via the FIFO engine. Skip voided + complimentary lines
  // since they didn't generate revenue. Falls back to 0 when no recipes
  // were tagged (drinks-only outlet, legacy data) so the tile still
  // renders without lying.
  const cogs = paid.reduce(
    (s, o) =>
      s +
      o.items
        .filter((li) => !li.voidedAt && !li.complimentary)
        .reduce((ls, li) => ls + (li.cogs ?? 0), 0),
    0
  );
  const revenue = paid.reduce((s, o) => s + (o.subTotal - o.discount), 0);
  const grossMargin = revenue - cogs;
  const grossMarginPct = revenue > 0 ? (grossMargin / revenue) * 100 : 0;
  // Expected drawer = opening + top-ups - withdrawals + cash sales - expenses-paid-in-cash
  const cashExpenses = expenses.filter((e) => e.paymentMode === "CASH").reduce((s, e) => s + e.amount, 0);
  const closingCash = opening + topUps - withdrawals + cashSales - cashExpenses;

  const dateLabel = new Date(date).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <PageHeader
        title={`Day End — ${dateLabel}`}
        description={`${paid.length} settled orders · ${cancelled} cancelled · ${expenses.length} expense entries`}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/day-end">
                <ArrowLeft className="h-4 w-4" />
                All days
              </Link>
            </Button>
            <Button variant="outline" size="sm">
              <Printer className="h-4 w-4" />
              Print Z-report
            </Button>
            {existingClose && (
              <Badge variant={Math.abs(existingClose.variance) <= 100 ? "success" : "destructive"}>
                Variance {inr(existingClose.variance)}
              </Badge>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <Kpi label="Total sales" value={inr(sales)} />
        <Kpi label="Taxes collected" value={inr(taxes)} />
        <Kpi label="Cash sales" value={inr(cashSales)} tone="good" />
        <Kpi label="Closing cash" value={inr(closingCash)} tone={closingCash >= 0 ? "good" : "bad"} />
      </div>

      {/* COGS row — only when at least one recipe-attached item sold.
          Cleaner than rendering "₹0 — 0.0%" tiles when an outlet has
          no recipes wired yet. */}
      {cogs > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Kpi label="COGS (FIFO)" value={inr(cogs)} tone="bad" />
          <Kpi
            label="Gross margin"
            value={inr(grossMargin)}
            tone={grossMargin >= 0 ? "good" : "bad"}
          />
          <Kpi
            label="Margin %"
            value={`${grossMarginPct.toFixed(1)}%`}
            tone={grossMarginPct >= 0 ? "good" : "bad"}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader>
            <CardTitle>Payment-mode split</CardTitle>
            <CardDescription>Where the day's money came from</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {["CASH", "UPI", "CARD", "ONLINE", "DUE"].map((m) => {
                  const v = sumByPM(m);
                  return (
                    <TableRow key={m}>
                      <TableCell>{m}</TableCell>
                      <TableCell className="text-right font-medium">{inr(v)}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{inr(sales)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Order type split</CardTitle>
            <CardDescription>Channel-wise sales</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {(["DINE_IN", "PICKUP", "DELIVERY"] as const).map((t) => {
                  const v = sumByType(t);
                  const c = paid.filter((o) => o.orderType === t).length;
                  return (
                    <TableRow key={t}>
                      <TableCell>{t.replace("_", " ")}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{c} orders</TableCell>
                      <TableCell className="text-right font-medium">{inr(v)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Cash denomination</CardTitle>
          <CardDescription>
            Count the cash drawer by denomination and submit. The system computes variance against the
            expected closing cash of <strong>{inr(closingCash)}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DenominationForm
            businessDay={date}
            expectedCash={closingCash}
            existing={
              existingClose
                ? {
                    counted: existingClose.countedCash,
                    variance: existingClose.variance,
                    denominations: existingClose.denominations,
                    note: existingClose.note ?? "",
                  }
                : null
            }
          />
        </CardContent>
      </Card>

      {expenses.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Expenses on this day</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.category}</TableCell>
                    <TableCell>{e.vendor ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{e.paymentMode}</TableCell>
                    <TableCell className="text-right font-medium">{inr(e.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right">{inr(totalExpenses)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ─── Additional Z-report sections per spec §5.1 ─── */}
      <ZReportExtraSections paid={paid} kots={kots} orders={orders} />

      {/* Signatures block */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Signatures</CardTitle>
          <CardDescription>Day-close sign-off — printed on the Z-report.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
          {["Cashier", "Manager", "Owner"].map((role) => (
            <div key={role} className="space-y-2">
              <div className="border-b border-dashed h-12" />
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{role}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/** Sections 6–15 of the Z-report spec — category × qty, hourly grid, top items, leakage, anomalies. */
function ZReportExtraSections({
  paid,
  kots,
  orders,
}: {
  paid: Array<{ items: Array<{ name: string; qty: number; price: number; taxRate: number; item: { category: { name: string } | null } | null }>; createdAt: Date; status: string; subTotal: number; taxTotal: number; discount: number }>;
  kots: { status: string }[];
  orders: { status: string }[];
}) {
  // Category
  const byCat = new Map<string, { qty: number; net: number }>();
  for (const o of paid) {
    for (const li of o.items) {
      const cat = li.item?.category?.name ?? "Uncategorised";
      const cur = byCat.get(cat) ?? { qty: 0, net: 0 };
      cur.qty += li.qty;
      cur.net += li.qty * li.price;
      byCat.set(cat, cur);
    }
  }
  // Hourly
  const byHour = new Map<number, { bills: number; gross: number; net: number }>();
  for (const o of paid) {
    const h = o.createdAt.getHours();
    const cur = byHour.get(h) ?? { bills: 0, gross: 0, net: 0 };
    cur.bills += 1;
    cur.gross += o.subTotal + o.taxTotal;
    cur.net += o.subTotal + o.taxTotal - o.discount;
    byHour.set(h, cur);
  }
  // Top items
  const byItem = new Map<string, { qty: number; net: number }>();
  for (const o of paid) {
    for (const li of o.items) {
      const cur = byItem.get(li.name) ?? { qty: 0, net: 0 };
      cur.qty += li.qty;
      cur.net += li.qty * li.price;
      byItem.set(li.name, cur);
    }
  }
  const topItems = [...byItem.entries()].sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);
  // KOT leakage
  const kotCancelled = kots.filter((k) => k.status === "CANCELLED").length;
  // Bill leakage
  const billCancelled = orders.filter((o) => o.status === "CANCELLED").length;
  // Tax bifurcation
  const tax = paid.reduce((s, o) => s + o.taxTotal, 0);
  const cgst = tax / 2, sgst = tax / 2;
  // Anomalies
  const anomalies: string[] = [];
  if (kotCancelled > 5) anomalies.push(`${kotCancelled} KOTs cancelled (> 5 threshold)`);
  if (billCancelled > 3) anomalies.push(`${billCancelled} bills cancelled (> 3 threshold)`);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
      <Card>
        <CardHeader><CardTitle>Sales by category</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {[...byCat.entries()].sort((a, b) => b[1].net - a[1].net).map(([cat, v]) => (
                <TableRow key={cat}>
                  <TableCell>{cat}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{v.qty}</TableCell>
                  <TableCell className="text-right font-medium">{inr(v.net)}</TableCell>
                </TableRow>
              ))}
              {byCat.size === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-4">No sales</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sales by hour</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {[...byHour.entries()].sort((a, b) => a[0] - b[0]).map(([h, v]) => (
                <TableRow key={h}>
                  <TableCell className="font-mono">{String(h).padStart(2, "0")}:00</TableCell>
                  <TableCell className="text-right text-muted-foreground">{v.bills} bills</TableCell>
                  <TableCell className="text-right font-medium">{inr(v.net)}</TableCell>
                </TableRow>
              ))}
              {byHour.size === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-4">No bills</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Top 10 items</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {topItems.map(([name, v]) => (
                <TableRow key={name}>
                  <TableCell>{name}</TableCell>
                  <TableCell className="text-right text-muted-foreground">×{v.qty}</TableCell>
                  <TableCell className="text-right font-medium">{inr(v.net)}</TableCell>
                </TableRow>
              ))}
              {topItems.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-4">No items</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Tax bifurcation</CardTitle><CardDescription>For GST filing</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow><TableCell>CGST</TableCell><TableCell className="text-right font-medium">{inr(cgst)}</TableCell></TableRow>
              <TableRow><TableCell>SGST</TableCell><TableCell className="text-right font-medium">{inr(sgst)}</TableCell></TableRow>
              <TableRow><TableCell>IGST</TableCell><TableCell className="text-right text-muted-foreground">{inr(0)}</TableCell></TableRow>
              <TableRow className="bg-muted/40 font-semibold"><TableCell>Total</TableCell><TableCell className="text-right">{inr(tax)}</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Leakage signals</CardTitle><CardDescription>KOTs + bills cancelled / modified</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow><TableCell>KOTs cancelled</TableCell><TableCell className="text-right font-medium">{kotCancelled}</TableCell></TableRow>
              <TableRow><TableCell>Bills cancelled</TableCell><TableCell className="text-right font-medium">{billCancelled}</TableCell></TableRow>
              <TableRow><TableCell>Bills modified</TableCell><TableCell className="text-right text-muted-foreground">—</TableCell></TableRow>
              <TableRow><TableCell>Bills reprinted</TableCell><TableCell className="text-right text-muted-foreground">—</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Anomalies flagged</CardTitle></CardHeader>
        <CardContent>
          {anomalies.length === 0 ? (
            <div className="text-sm text-muted-foreground">No anomalies above tolerance.</div>
          ) : (
            <ul className="space-y-1.5">
              {anomalies.map((a) => (
                <li key={a} className="flex items-start gap-2 text-sm">
                  <Badge variant="warning" className="text-[10px] shrink-0">FLAG</Badge>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "bad" | "neutral" }) {
  const colors = { good: "text-emerald-600", bad: "text-rose-600", neutral: "" };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold mt-1 ${colors[tone]}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
