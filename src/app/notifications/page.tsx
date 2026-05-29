import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { Check, Trash2 } from "lucide-react";
import { markAllRead, clearRead } from "./actions";
import { Empty } from "@/components/ui/empty";

export const dynamic = "force-dynamic";

const KIND_TONE: Record<string, "destructive" | "warning" | "info" | "secondary"> = {
  LOW_STOCK: "destructive",
  STALE_BILL: "warning",
  ONLINE_ORDER: "info",
  INFO: "secondary",
};

export default async function NotificationsPage() {
  const outlet = await getActiveOutlet();
  const list = await db.notification.findMany({
    where: { outletId: outlet.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const unread = list.filter((n) => !n.read).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={`${list.length} total · ${unread} unread`}
        actions={
          <>
            <form action={markAllRead}>
              <Button type="submit" variant="outline" size="sm" disabled={unread === 0}>
                <Check className="h-4 w-4" />
                Mark all read
              </Button>
            </form>
            <form action={clearRead}>
              <Button type="submit" variant="ghost" size="sm">
                <Trash2 className="h-4 w-4" />
                Clear read
              </Button>
            </form>
          </>
        }
      />

      {list.length === 0 ? (
        <Card>
          <CardContent>
            <Empty title="No notifications" desc="Low-stock alerts, new online orders, and stale bills will appear here." />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {list.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.link ?? "/"}
                    className={`flex items-start gap-3 px-4 py-3 hover:bg-accent ${n.read ? "opacity-60" : ""}`}
                  >
                    <Badge variant={KIND_TONE[n.kind] ?? "secondary"} className="shrink-0">
                      {n.kind.replace("_", " ")}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {!n.read && <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500 mr-1.5 align-middle" />}
                        {n.title}
                      </div>
                      {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(n.createdAt).toLocaleString("en-IN")}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
