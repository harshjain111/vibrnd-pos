import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inr, inr2 } from "@/lib/utils";
import { ArrowLeft, ChefHat, Printer, RotateCcw, Pencil, Undo2, Ban } from "lucide-react";
import {
  CancelOrderButton,
  ReprintBillButton,
  SplitBillButton,
  CompOrderButton,
  MoveTableButton,
  MoveItemsButton,
  ChangeCustomerNameButton,
  VoidLineButton,
  CloseTableButton,
  CompLineButton,
  ApplyDiscountButton,
} from "./client";
import { reopenOrder } from "./actions";
import { getAuthorizedUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { canAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "success" | "info" | "warning" | "destructive" | "secondary"> = {
  PAID: "success",
  PRINTED: "info",
  SAVED: "warning",
  RUNNING: "warning",
  CANCELLED: "destructive",
  PLACED: "warning",
  ACCEPTED: "info",
  FOOD_READY: "success",
  PICKED_UP: "secondary",
  DELIVERED: "secondary",
  REJECTED: "destructive",
};

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const outlet = await getActiveOutlet();

  const order = await db.order.findFirst({
    where: { id, outletId: outlet.id },
    include: {
      items: true,
      customer: true,
      table: true,
      kots: { include: { lines: true }, orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) return notFound();

  const logs = await db.activityLog.findMany({
    where: { entity: "Order", entityId: order.id },
    orderBy: { createdAt: "asc" },
  });
  const canEdit = !!(await getAuthorizedUser("MANAGER"));

  // Role-aware action gating for the access-matrix POS buttons. We resolve
  // each permission once here so the JSX stays declarative — and so a
  // cashier doesn't see clutter they can't use.
  const user = await getSessionUser();
  const role = user?.role ?? "";
  const canMoveTable = canAccess(role, "pos.action.move_table");
  const canShiftItems = canAccess(role, "pos.action.item_shift");
  const canChangeCustomer = canAccess(role, "pos.action.change_customer");
  const canVoid = canAccess(role, "pos.action.void_item");
  const canPrint = canAccess(role, "pos.action.print_bill");
  const canSettle = canAccess(role, "pos.action.settle_bill");
  const canComp = canAccess(role, "pos.action.complimentary");
  const canSplit = canAccess(role, "pos.action.split_bill");
  const canDiscount = canAccess(role, "pos.action.discount");

  const cancelled2 = order.status === "CANCELLED";
  const settled2 = order.status === "PAID";

  // Load the picker payload for Move Table + Move Items only when the user
  // can use them — avoids pointless DB roundtrips for read-only roles.
  const tables = canMoveTable
    ? await db.diningTable.findMany({
        where: { outletId: outlet.id },
        orderBy: { name: "asc" },
      })
    : [];
  const otherOpenOrders =
    canShiftItems && !cancelled2 && !settled2
      ? await db.order.findMany({
          where: {
            outletId: outlet.id,
            status: { notIn: ["PAID", "CANCELLED"] },
            id: { not: order.id },
          },
          include: { table: true },
          orderBy: { createdAt: "desc" },
          take: 30,
        })
      : [];
  // For the table picker: which tables are already serving another running
  // order? Shown disabled with the offending invoice.
  const tableOccupancy = new Map<string, string>();
  if (canMoveTable) {
    const running = await db.order.findMany({
      where: {
        outletId: outlet.id,
        status: { notIn: ["PAID", "CANCELLED"] },
        id: { not: order.id },
        tableId: { not: null },
      },
      select: { tableId: true, invoiceNo: true },
    });
    for (const r of running) if (r.tableId) tableOccupancy.set(r.tableId, r.invoiceNo);
  }

  const lineRows = order.items.map((li) => {
    let addons: { name: string; priceDelta: number }[] = [];
    if (li.addonsJson) {
      try {
        addons = JSON.parse(li.addonsJson);
      } catch {}
    }
    return { ...li, addons };
  });

  const settled = order.status === "PAID";
  const cancelled = order.status === "CANCELLED";
  const unsettled = !cancelled && !order.closedAt && (order.paymentMode === "DUE" || !order.paymentMode);

  return (
    <div>
      <PageHeader
        title={order.invoiceNo}
        description={`${order.orderType.replace("_", " ")}${order.subOrderType ? ` (${order.subOrderType})` : ""} · ${order.channel} · ${new Date(order.createdAt).toLocaleString("en-IN")}${order.amendedAt ? ` · amended ${new Date(order.amendedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}`}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/orders">
                <ArrowLeft className="h-4 w-4" />
                Back to orders
              </Link>
            </Button>
            {settled && canPrint && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/billing/receipt/${order.id}`}>
                  <Printer className="h-4 w-4" />
                  Receipt
                </Link>
              </Button>
            )}
            {settled && canPrint && (
              <ReprintBillButton id={order.id} invoiceNo={order.invoiceNo} count={order.reprintCount ?? 0} />
            )}
            {settled && canSettle && order.tableId && !order.closedAt && order.table && (
              <CloseTableButton id={order.id} invoiceNo={order.invoiceNo} tableName={order.table.name} />
            )}
            {!cancelled && canEdit && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/orders/${order.id}/edit`}>
                  <Pencil className="h-4 w-4" />
                  Edit lines
                </Link>
              </Button>
            )}
            {settled && canEdit && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/orders/${order.id}/return`}>
                  <Undo2 className="h-4 w-4" />
                  Return
                </Link>
              </Button>
            )}
            {unsettled && canSettle && (
              <Button size="sm" asChild>
                <Link href={`/settlements?q=${order.invoiceNo}`}>
                  <Printer className="h-4 w-4" />
                  Settle
                </Link>
              </Button>
            )}
            {!cancelled && !settled && canMoveTable && (
              <MoveTableButton
                id={order.id}
                invoiceNo={order.invoiceNo}
                currentTableName={order.table?.name ?? null}
                tables={tables.map((t) => ({
                  id: t.id,
                  name: t.name,
                  occupiedBy: tableOccupancy.get(t.id) ?? null,
                }))}
              />
            )}
            {!cancelled && !settled && canShiftItems && (
              <MoveItemsButton
                id={order.id}
                invoiceNo={order.invoiceNo}
                items={order.items.map((it) => ({
                  id: it.id,
                  name: it.name,
                  qty: it.qty,
                  price: it.price,
                  voided: !!it.voidedAt,
                }))}
                targetOrders={otherOpenOrders.map((o) => ({
                  id: o.id,
                  invoiceNo: o.invoiceNo,
                  tableName: o.table?.name ?? null,
                }))}
              />
            )}
            {!cancelled && canChangeCustomer && (
              <ChangeCustomerNameButton
                id={order.id}
                invoiceNo={order.invoiceNo}
                currentName={order.customerName ?? order.customer?.name ?? ""}
                currentPhone={order.customerPhone ?? order.customer?.phone ?? ""}
              />
            )}
            {!cancelled && !settled && canSplit && order.items.length > 1 && (
              <SplitBillButton
                id={order.id}
                invoiceNo={order.invoiceNo}
                items={order.items.map((it) => ({ id: it.id, name: it.name, qty: it.qty, price: it.price }))}
              />
            )}
            {!cancelled && !settled && canComp && (
              <CompOrderButton id={order.id} invoiceNo={order.invoiceNo} />
            )}
            {!cancelled && !settled && canDiscount && (
              <ApplyDiscountButton
                id={order.id}
                invoiceNo={order.invoiceNo}
                currentDiscount={order.discount}
                currentDiscountCode={order.discountCode ?? null}
              />
            )}
            {!cancelled && <CancelOrderButton id={order.id} invoiceNo={order.invoiceNo} />}
            {cancelled && (
              <form action={reopenOrder}>
                <input type="hidden" name="id" value={order.id} />
                <Button type="submit" variant="outline" size="sm">
                  <RotateCcw className="h-4 w-4" />
                  Reopen
                </Button>
              </form>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    {(canVoid || canComp) && !cancelled2 && !settled2 && <TableHead className="w-32 text-right" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineRows.map((li) => {
                    const voided = !!li.voidedAt;
                    const comp = !!li.complimentary;
                    const dimmed = voided || comp;
                    return (
                      <TableRow
                        key={li.id}
                        className={
                          voided
                            ? "bg-destructive/5"
                            : comp
                            ? "bg-amber-50/50"
                            : ""
                        }
                      >
                        <TableCell>
                          <div className={"font-medium " + (voided ? "line-through text-muted-foreground" : "")}>
                            {li.name}
                          </div>
                          {li.addons.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              + {li.addons.map((a) => `${a.name}${a.priceDelta ? ` ₹${a.priceDelta}` : ""}`).join(", ")}
                            </div>
                          )}
                          {voided && (
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
                              <Ban className="h-3 w-3" />
                              VOIDED
                              {li.voidReason ? <span className="text-muted-foreground">— {li.voidReason}</span> : null}
                            </div>
                          )}
                          {comp && !voided && (
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-800">
                              <span className="font-semibold">COMP</span>
                              <span>— ₹0.00 on bill</span>
                              {li.compReason ? <span className="text-muted-foreground">· {li.compReason}</span> : null}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className={"text-right " + (dimmed ? "text-muted-foreground" : "")}>{li.qty}</TableCell>
                        <TableCell className={"text-right " + (dimmed ? "text-muted-foreground" : "")}>{inr2(li.price)}</TableCell>
                        <TableCell
                          className={
                            "text-right font-medium " +
                            (voided ? "line-through text-muted-foreground" : comp ? "text-amber-800" : "")
                          }
                        >
                          {comp && !voided ? "₹0.00" : inr2(li.price * li.qty)}
                        </TableCell>
                        {(canVoid || canComp) && !cancelled2 && !settled2 && (
                          <TableCell className="text-right whitespace-nowrap">
                            {!voided && canComp && (
                              <CompLineButton
                                orderId={order.id}
                                lineId={li.id}
                                lineName={li.name}
                                qty={li.qty}
                                isComp={comp}
                              />
                            )}
                            {!voided && !comp && canVoid && (
                              <VoidLineButton orderId={order.id} lineId={li.id} lineName={li.name} qty={li.qty} />
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {order.kots.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ChefHat className="h-4 w-4" /> Kitchen tickets ({order.kots.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-4 pt-0">
                {order.kots.map((kot) => (
                  <div key={kot.id} className="border rounded-md p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs">{kot.kotNo}</span>
                      <Badge variant={STATUS_VARIANT[kot.status] ?? "secondary"}>{kot.status}</Badge>
                    </div>
                    <ul className="text-sm">
                      {kot.lines.map((l) => (
                        <li key={l.id} className="flex justify-between">
                          <span>
                            {l.name}
                            {l.note && <span className="text-muted-foreground"> · {l.note}</span>}
                          </span>
                          <span className="text-muted-foreground">×{l.qty}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>Audit trail for this order</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0">
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
              ) : (
                logs.map((l) => (
                  <div key={l.id} className="text-sm flex items-start gap-3 border-b last:border-0 pb-2">
                    <Badge variant="outline" className="shrink-0">
                      {l.action}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div>{l.summary}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(l.createdAt).toLocaleString("en-IN")} · {l.actor}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm p-4 pt-0">
              <Row label="Status" value={<Badge variant={STATUS_VARIANT[order.status] ?? "secondary"}>{order.status}</Badge>} />
              <Row label="Payment" value={order.paymentMode ?? "—"} />
              <Row label="Subtotal" value={inr2(order.subTotal)} />
              <Row label="GST" value={inr2(order.taxTotal)} />
              {order.discount > 0 && (
                <>
                  <Row
                    label={`Discount${order.discountCode ? ` (${order.discountCode})` : ""}`}
                    value={<span className="text-emerald-700">−{inr2(order.discount)}</span>}
                  />
                  {order.discountReason && (
                    <div className="text-[11px] text-muted-foreground italic -mt-1.5 ml-0">
                      Reason: {order.discountReason}
                    </div>
                  )}
                </>
              )}
              {order.tip > 0 && <Row label="Tip" value={<span className="text-emerald-700">+{inr2(order.tip)}</span>} />}
              <div className="flex items-center justify-between text-base font-semibold pt-2 border-t">
                <span>Grand total</span>
                <span>{inr(order.grandTotal)}</span>
              </div>
              {/* COGS + gross margin — derived from per-line cogs
                  snapshotted at place-order. Suppressed when COGS=0
                  (no recipes attached, drinks-only bill, etc.) so the
                  Summary card doesn't get noisy. */}
              {(() => {
                const cogs = order.items
                  .filter((li) => !li.voidedAt && !li.complimentary)
                  .reduce((s, li) => s + (li.cogs ?? 0), 0);
                if (cogs <= 0) return null;
                // Margin = revenue (sub-total + tip, ex-tax, ex-discount-recovered) − cogs.
                // We use subTotal as the revenue baseline because GST is a pass-through
                // and tip/service charge aren't usually marginable.
                const revenue = order.subTotal - order.discount;
                const margin = revenue - cogs;
                const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
                return (
                  <div className="pt-2 mt-2 border-t space-y-1">
                    <Row label="COGS (FIFO)" value={<span className="text-rose-700">−{inr2(cogs)}</span>} />
                    <Row
                      label="Gross margin"
                      value={
                        <span className={margin >= 0 ? "text-emerald-700 font-medium" : "text-rose-700 font-medium"}>
                          {inr2(margin)} ({marginPct.toFixed(1)}%)
                        </span>
                      }
                    />
                  </div>
                );
              })()}
              {(order.loyaltyEarned > 0 || order.loyaltyRedeemed > 0) && (
                <div className="pt-2 mt-2 border-t space-y-1">
                  {order.loyaltyRedeemed > 0 && (
                    <Row label="Points redeemed" value={<span className="text-amber-700">−{order.loyaltyRedeemed} pts</span>} />
                  )}
                  {order.loyaltyEarned > 0 && (
                    <Row label="Points earned" value={<span className="text-emerald-700">+{order.loyaltyEarned} pts</span>} />
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm p-4 pt-0">
              <Row label="Name" value={order.customer?.name ?? "Walk-in"} />
              <Row label="Phone" value={order.customer?.phone ?? "—"} />
              {order.deliveryAddress && <Row label="Address" value={order.deliveryAddress} />}
              {order.riderName && (
                <>
                  <Row label="Rider" value={order.riderName} />
                  <Row label="Rider phone" value={order.riderPhone ?? "—"} />
                  <Row label="OTP" value={order.deliveryOtp ?? "—"} />
                </>
              )}
              {order.table && <Row label="Table" value={order.table.name} />}
              {order.aggregatorOrderId && <Row label="Aggregator ID" value={order.aggregatorOrderId} />}
            </CardContent>
          </Card>

          {order.payments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Receipts</CardTitle>
                <CardDescription>
                  {order.amountPaid >= order.grandTotal - 0.01
                    ? `Fully paid · ${order.payments.length} receipt${order.payments.length === 1 ? "" : "s"}`
                    : `${inr(order.amountPaid)} of ${inr(order.grandTotal)} received · balance ${inr(order.grandTotal - order.amountPaid)}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm p-4 pt-0 space-y-1.5">
                {order.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-xs border-b last:border-0 pb-1.5">
                    <div>
                      <div className="font-medium text-foreground">
                        {inr(p.amount)} <Badge variant="outline" className="text-[10px] ml-1">{p.mode}</Badge>
                      </div>
                      {p.note && <div className="text-muted-foreground mt-0.5">{p.note}</div>}
                    </div>
                    <div className="text-right text-muted-foreground">
                      <div>{new Date(p.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                      <div className="font-mono">{p.actor}</div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {order.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm p-4 pt-0">{order.notes}</CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
