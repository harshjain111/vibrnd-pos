import { db } from "./db";

export type RangeKey = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth";

export function rangeBounds(key: RangeKey): { from: Date; to: Date; label: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case "today":
      return { from: today, to: now, label: "Today" };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(today.getDate() - 1);
      const end = new Date(today);
      end.setMilliseconds(-1);
      return { from: y, to: end, label: "Yesterday" };
    }
    case "last7": {
      const from = new Date(today);
      from.setDate(today.getDate() - 6);
      return { from, to: now, label: "Last 7 days" };
    }
    case "last30": {
      const from = new Date(today);
      from.setDate(today.getDate() - 29);
      return { from, to: now, label: "Last 30 days" };
    }
    case "thisMonth": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to: now, label: "This month" };
    }
    case "lastMonth": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { from, to, label: "Last month" };
    }
  }
}

export async function dashboardKpis(outletId: string, key: RangeKey = "last7") {
  const { from, to, label } = rangeBounds(key);

  const orders = await db.order.findMany({
    where: { outletId, createdAt: { gte: from, lte: to }, status: { in: ["PAID", "PRINTED", "SAVED"] } },
  });

  const totalSales = orders.reduce((s, o) => s + o.grandTotal, 0);
  const totalTax = orders.reduce((s, o) => s + o.taxTotal, 0);

  const byType = (t: string) => orders.filter((o) => o.orderType === t);
  const dineIn = byType("DINE_IN");
  const pickup = byType("PICKUP");
  const delivery = byType("DELIVERY");

  const byPayment = (m: string) => orders.filter((o) => o.paymentMode === m).reduce((s, o) => s + o.grandTotal, 0);
  const payments = {
    cash: byPayment("CASH"),
    card: byPayment("CARD"),
    upi: byPayment("UPI"),
    online: byPayment("ONLINE"),
    other: byPayment("DUE"),
  };

  const expenses = await db.expense.findMany({ where: { outletId, createdAt: { gte: from, lte: to } } });
  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);

  // Hourly distribution (0-23) for chart
  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, sales: 0 }));
  for (const o of orders) {
    const h = new Date(o.createdAt).getHours();
    hourly[h].orders += 1;
    hourly[h].sales += o.grandTotal;
  }

  // Per-day for last 7 days (regardless of range — used in trend chart)
  const trend: { date: string; sales: number; orders: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    const dayOrders = await db.order.findMany({
      where: { outletId, createdAt: { gte: d, lt: next }, status: { in: ["PAID", "PRINTED", "SAVED"] } },
    });
    trend.push({
      date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      sales: dayOrders.reduce((s, o) => s + o.grandTotal, 0),
      orders: dayOrders.length,
    });
  }

  return {
    label,
    from,
    to,
    totals: {
      sales: totalSales,
      tax: totalTax,
      orders: orders.length,
      avgOrderValue: orders.length ? totalSales / orders.length : 0,
      expenses: expensesTotal,
      netProfit: totalSales - expensesTotal,
    },
    payments,
    byType: {
      dineIn: { count: dineIn.length, total: dineIn.reduce((s, o) => s + o.grandTotal, 0) },
      pickup: { count: pickup.length, total: pickup.reduce((s, o) => s + o.grandTotal, 0) },
      delivery: { count: delivery.length, total: delivery.reduce((s, o) => s + o.grandTotal, 0) },
    },
    hourly,
    trend,
    statusCounts: {
      successful: orders.filter((o) => o.status === "PAID").length,
      cancelled: await db.order.count({ where: { outletId, status: "CANCELLED", createdAt: { gte: from, lte: to } } }),
    },
  };
}
