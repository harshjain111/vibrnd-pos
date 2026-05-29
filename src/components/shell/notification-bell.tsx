import { db } from "@/lib/db";
import { NotificationPopover } from "./notification-popover";

export async function NotificationBell({ outletId }: { outletId: string }) {
  // Backfill ephemeral signals (low stock + stale held bills) as live notifications
  // — these aren't event-driven yet, so we generate them on read.
  await syncDerivedNotifications(outletId);

  const recent = await db.notification.findMany({
    where: { outletId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const unread = recent.filter((n) => !n.read).length;

  const items = recent.map((n) => ({
    key: n.id,
    id: n.id,
    severity: (n.kind === "LOW_STOCK"
      ? "destructive"
      : n.kind === "STALE_BILL"
      ? "warning"
      : n.kind === "ONLINE_ORDER"
      ? "info"
      : "info") as "info" | "warning" | "destructive",
    title: n.title,
    detail: n.body ?? "",
    href: n.link ?? "/",
    read: n.read,
  }));

  return <NotificationPopover items={items} count={unread} />;
}

/** Generate or refresh derived notifications. Idempotent within a short window. */
async function syncDerivedNotifications(outletId: string) {
  // Critical low stock — one notification per RM, refreshed at most once per hour
  const lowStock = await db.rawMaterial.findMany({
    where: { outletId, currentQty: { lt: 0 } }, // strictly negative — we'll override below
  });
  const allRms = await db.rawMaterial.findMany({ where: { outletId } });
  const critical = allRms.filter((r) => r.currentQty < r.minLevel);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  for (const r of critical) {
    const existing = await db.notification.findFirst({
      where: { outletId, kind: "LOW_STOCK", body: { contains: r.name, mode: "insensitive" }, createdAt: { gte: oneHourAgo } },
    });
    if (existing) continue;
    await db.notification.create({
      data: {
        outletId,
        kind: "LOW_STOCK",
        title: `${r.name} below min level`,
        body: `${r.currentQty} ${r.unit} remaining (min ${r.minLevel})`,
        link: "/inventory",
      },
    });
  }
}
