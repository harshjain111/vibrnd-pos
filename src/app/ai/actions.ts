"use server";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";

export type AiReply = {
  text: string;
  link?: { label: string; href: string };
};

/**
 * Pattern-matched "Ask AI". Not actually an LLM — runs real Prisma queries against
 * the outlet and formats responses. Cheap, deterministic, demo-friendly.
 */
export async function askAi(question: string): Promise<AiReply> {
  const q = question.toLowerCase().trim();
  if (!q) return { text: "Ask me something. Try: top selling items today, low stock, yesterday sales." };

  const outlet = await getActiveOutlet();

  // ---------- Sales ----------
  if (q.includes("today") && (q.includes("sales") || q.includes("revenue") || q.includes("earn"))) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const orders = await db.order.findMany({
      where: { outletId: outlet.id, createdAt: { gte: today }, status: { in: ["PAID", "PRINTED"] } },
    });
    const total = orders.reduce((s, o) => s + o.grandTotal, 0);
    return {
      text: `Today: ${inr(total)} across ${orders.length} orders. AOV ${inr(orders.length ? total / orders.length : 0)}.`,
      link: { label: "Open dashboard", href: "/?range=today" },
    };
  }

  if (q.includes("yesterday") && (q.includes("sales") || q.includes("revenue") || q.includes("earn"))) {
    const start = new Date();
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    const orders = await db.order.findMany({
      where: { outletId: outlet.id, createdAt: { gte: start, lte: end }, status: { in: ["PAID", "PRINTED"] } },
    });
    const total = orders.reduce((s, o) => s + o.grandTotal, 0);
    return {
      text: `Yesterday: ${inr(total)} across ${orders.length} orders.`,
      link: { label: "Open dashboard", href: "/?range=yesterday" },
    };
  }

  if ((q.includes("month") || q.includes("monthly")) && (q.includes("sales") || q.includes("revenue") || q.includes("earn"))) {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const orders = await db.order.findMany({
      where: { outletId: outlet.id, createdAt: { gte: start }, status: { in: ["PAID", "PRINTED"] } },
    });
    const total = orders.reduce((s, o) => s + o.grandTotal, 0);
    return {
      text: `This month so far: ${inr(total)} across ${orders.length} orders.`,
      link: { label: "Open dashboard", href: "/?range=thisMonth" },
    };
  }

  // ---------- Top items ----------
  if (q.includes("top") && (q.includes("item") || q.includes("sell") || q.includes("dish"))) {
    const last7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const orders = await db.order.findMany({
      where: { outletId: outlet.id, createdAt: { gte: last7 }, status: { in: ["PAID", "PRINTED"] } },
      include: { items: true },
    });
    const map = new Map<string, number>();
    for (const o of orders) for (const li of o.items) map.set(li.name, (map.get(li.name) ?? 0) + li.qty);
    const top = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (top.length === 0) return { text: "No item sales in the last 7 days." };
    return {
      text: `Top sellers last 7 days: ${top.map(([n, q]) => `${n} (${q})`).join(", ")}.`,
      link: { label: "Open item report", href: "/reports/item-wise" },
    };
  }

  // ---------- Inventory ----------
  if (q.includes("low") && (q.includes("stock") || q.includes("inventory"))) {
    const rms = await db.rawMaterial.findMany({ where: { outletId: outlet.id } });
    const critical = rms.filter((r) => r.currentQty < r.minLevel);
    if (critical.length === 0) return { text: "Stock is fine — nothing below minimum.", link: { label: "Open inventory", href: "/inventory" } };
    return {
      text: `${critical.length} items below min: ${critical
        .map((r) => `${r.name} (${r.currentQty}${r.unit})`)
        .join(", ")}.`,
      link: { label: "Open inventory", href: "/inventory" },
    };
  }

  if (q.includes("stock") && q.includes("worth")) {
    const rms = await db.rawMaterial.findMany({ where: { outletId: outlet.id } });
    const worth = rms.reduce((s, r) => s + r.currentQty * r.avgCost, 0);
    return { text: `Current stock worth: ${inr(worth)} across ${rms.length} raw materials.`, link: { label: "Open inventory", href: "/inventory" } };
  }

  // ---------- Orders / status ----------
  if ((q.includes("live") || q.includes("running") || q.includes("open")) && q.includes("order")) {
    const live = await db.order.count({
      where: { outletId: outlet.id, status: { in: ["RUNNING", "SAVED", "PRINTED"] } },
    });
    return { text: `${live} open orders right now.`, link: { label: "View live orders", href: "/orders/live" } };
  }

  if (q.includes("online") && q.includes("order")) {
    const placed = await db.order.count({
      where: { outletId: outlet.id, channel: { in: ["SWIGGY", "ZOMATO", "MAGICPIN", "DOTPE"] }, status: "PLACED" },
    });
    return { text: `${placed} online orders awaiting accept.`, link: { label: "View online orders", href: "/orders/online" } };
  }

  // ---------- Customers ----------
  if (q.includes("top") && q.includes("customer")) {
    const customers = await db.customer.findMany({
      where: { outletId: outlet.id },
      include: { orders: true },
    });
    const ranked = customers
      .map((c) => ({ name: c.name, spend: c.orders.reduce((s, o) => s + o.grandTotal, 0) }))
      .filter((c) => c.spend > 0)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);
    if (ranked.length === 0) return { text: "No customer-attributed spend yet." };
    return {
      text: `Top customers: ${ranked.map((c) => `${c.name} (${inr(c.spend)})`).join(", ")}.`,
      link: { label: "Open customers", href: "/customers" },
    };
  }

  // ---------- Cancellations ----------
  if (q.includes("cancel")) {
    const last7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const cancelled = await db.order.findMany({
      where: { outletId: outlet.id, status: "CANCELLED", createdAt: { gte: last7 } },
    });
    const lost = cancelled.reduce((s, o) => s + o.grandTotal, 0);
    return {
      text: `${cancelled.length} cancellations last 7 days, est. lost ${inr(lost)}.`,
      link: { label: "View cancelled", href: "/reports/cancelled" },
    };
  }

  // ---------- Store status ----------
  if (q.includes("store") && (q.includes("open") || q.includes("close") || q.includes("status"))) {
    return {
      text: `Store is currently ${outlet.storeOpen ? "OPEN" : "CLOSED"}. Toggle from the topbar pill.`,
    };
  }

  // ---------- Help ----------
  if (q.includes("add") && q.includes("item")) {
    return { text: "Go to Menu manager → Add item.", link: { label: "Add menu item", href: "/menu" } };
  }
  if (q.includes("invite") || q.includes("user")) {
    return { text: "OWNER role can invite users from Settings → Users.", link: { label: "Manage users", href: "/settings/users" } };
  }

  // ---------- Fallback ----------
  return {
    text:
      "I don't know that one yet. Try: \"today's sales\", \"top selling items\", \"low stock\", \"top customers\", \"cancellations last 7 days\", \"how do I add a menu item?\"",
  };
}
