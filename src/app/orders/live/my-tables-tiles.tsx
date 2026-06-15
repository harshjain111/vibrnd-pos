/**
 * Captain-facing tile grid that lives at the top of the Running orders
 * tab. Surfaces every DiningTable that belongs to a TableGroup owned by
 * the logged-in user, with the live state of the table — FREE, just
 * SEATED (receptionist handed off, no items punched yet), ORDER TAKEN
 * (items in cart but no KOT), KOT SENT (kitchen has it), READY (food's
 * up), or BILL (already printed).
 *
 * Server component on purpose — the page is `force-dynamic`, so a fresh
 * render runs on every nav, and `revalidatePath("/orders/live")` from
 * assignTableToCustomer makes a receptionist hand-off appear here
 * within one round-trip. No client polling needed for the v1 UX.
 *
 * Renders nothing if the viewer isn't a captain OR isn't assigned to
 * any table groups — so it cleanly disappears for outlets that haven't
 * set table groups up yet.
 */
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { inr } from "@/lib/utils";
import { Users, Coffee, ChefHat, CheckCircle2, Receipt, Sparkles } from "lucide-react";

type TableState = "FREE" | "SEATED" | "TAKING" | "KOT" | "READY" | "BILL";

/** Distinct colour + label per state — picked so the captain can scan
 *  the grid in a glance and find the table that needs them next. */
const STATE_META: Record<TableState, { label: string; tone: string; icon: typeof Coffee; copy: string }> = {
  FREE:   { label: "Free",        tone: "bg-emerald-50 border-emerald-300 text-emerald-900",   icon: CheckCircle2, copy: "Open · waiting for guests" },
  SEATED: { label: "Just seated", tone: "bg-amber-100  border-amber-500   text-amber-900 ring-2 ring-amber-300 ring-offset-1", icon: Sparkles, copy: "Receptionist handed off · take the order" },
  TAKING: { label: "Order taken", tone: "bg-amber-50   border-amber-400   text-amber-900",   icon: Coffee,       copy: "Items punched · send the KOT" },
  KOT:    { label: "KOT sent",    tone: "bg-blue-50    border-blue-400    text-blue-900",    icon: ChefHat,      copy: "Kitchen has the order" },
  READY:  { label: "Food ready",  tone: "bg-sky-50     border-sky-500     text-sky-900",     icon: Coffee,       copy: "Serve the guest" },
  BILL:   { label: "Bill printed",tone: "bg-rose-50    border-rose-400    text-rose-900",    icon: Receipt,      copy: "Awaiting payment" },
};

export async function MyTablesTiles() {
  const user = await getSessionUser();
  if (!user) return null;

  // Role gate:
  //   CAPTAIN   → only the groups assigned to *this* captain — that's
  //               their personal "tables waiting for me" surface.
  //   OWNER/MANAGER → every group in the outlet so they can see the
  //               whole floor at a glance and confirm hand-offs are
  //               flowing. The card title flips to "All tables" for
  //               them so the header doesn't lie.
  //   anyone else → nothing.
  const isCaptain = user.role === "CAPTAIN";
  const isOversight = user.role === "OWNER" || user.role === "MANAGER";
  if (!isCaptain && !isOversight) return null;

  // Captain: just their groups. Owner/Manager: everything in the outlet.
  const whereClause = isCaptain
    ? { captainId: user.id }
    : { outletId: user.outletId };

  const groups = await db.tableGroup.findMany({
    where: whereClause,
    include: {
      captain: { select: { name: true, email: true } },
      tables: {
        where: { active: true },
        orderBy: { name: "asc" },
        include: {
          orders: {
            where: { status: { in: ["RUNNING", "SAVED", "PRINTED"] } },
            include: {
              items: { select: { id: true } },
              kots: { select: { status: true } },
              customer: { select: { name: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const totalTables = groups.reduce((s, g) => s + g.tables.length, 0);

  // Captain with no groups → render nothing rather than badger them
  // about something only the owner can fix.
  if (isCaptain && totalTables === 0) return null;

  // Owner/manager with no groups → render a discoverable empty state
  // pointing at the setup page, so the feature is reachable from the
  // place where you'd expect to use it.
  if (isOversight && groups.length === 0) {
    return (
      <Card className="border-dashed border-primary/40 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-primary">Table groups</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            No table groups yet. Create one to assign tables to a captain — the captain will then see live tiles for their hand-offs here, and the floor plan will auto-assign new bills to them.{" "}
            <Link href="/settings/table-groups" className="font-medium text-primary underline underline-offset-2">
              Set up table groups →
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  const title = isCaptain ? "My tables" : "All tables";
  const subtitle = isCaptain
    ? "New hand-offs appear here automatically · click a tile to open the bill"
    : "Live status of every table group · click a tile to open the bill";

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-primary">{title}</h2>
            <span className="text-xs text-muted-foreground">
              ({totalTables} table{totalTables === 1 ? "" : "s"} across {groups.length} group{groups.length === 1 ? "" : "s"})
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">{subtitle}</span>
        </div>

        {groups.map((g) => (
          <div key={g.id} className="mb-3 last:mb-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 px-0.5 flex items-center gap-1.5">
              <span>{g.name} · {g.tables.length} table{g.tables.length === 1 ? "" : "s"}</span>
              {!isCaptain && g.captain && (
                <span className="text-muted-foreground/70 normal-case tracking-normal">· captain: {g.captain.name}</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
              {g.tables.map((t) => {
                const order = t.orders[0];
                const state = stateFor(order);
                const meta = STATE_META[state];
                const Icon = meta.icon;

                // Wait time only makes sense once a guest is seated.
                const wait =
                  order?.createdAt && state !== "FREE"
                    ? Math.max(0, Math.round((Date.now() - order.createdAt.getTime()) / 60000))
                    : null;
                const customerName = order?.customer?.name ?? order?.customerName ?? null;

                const tile = (
                  <div className={`rounded-md border-2 p-2.5 transition-all hover:shadow-md ${meta.tone}`}>
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="min-w-0">
                        <div className="text-sm font-bold leading-none">{t.name}</div>
                        <div className="text-[10px] opacity-80 mt-0.5 inline-flex items-center gap-1">
                          <Users className="h-2.5 w-2.5" />
                          {t.capacity}
                        </div>
                      </div>
                      <Icon className="h-4 w-4 shrink-0 opacity-70" />
                    </div>
                    <div className="mt-2">
                      <Badge variant="outline" className="text-[10px] bg-white/70 border-current/30">
                        {meta.label}
                      </Badge>
                    </div>
                    {customerName && (
                      <div className="text-[11px] font-medium mt-1.5 truncate" title={customerName}>
                        {customerName}
                      </div>
                    )}
                    {order && (
                      <div className="flex items-center justify-between mt-1 text-[10px] opacity-80">
                        <span>
                          {wait !== null ? (wait < 1 ? "just now" : `${wait}m`) : ""}
                          {order.items.length > 0 && ` · ${order.items.length} item${order.items.length === 1 ? "" : "s"}`}
                        </span>
                        {order.grandTotal > 0 && <span className="font-semibold">{inr(order.grandTotal)}</span>}
                      </div>
                    )}
                  </div>
                );

                // Free → start a new bill on the table. Anything else →
                // resume the existing order.
                const href = order ? `/billing?resume=${order.id}` : `/billing?table=${t.id}`;
                return (
                  <Link key={t.id} href={href} className="block" title={meta.copy}>
                    {tile}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Derive a captain-readable state from an order + KOT mix. */
function stateFor(order: { status: string; items: { id: string }[]; kots: { status: string }[] } | undefined): TableState {
  if (!order) return "FREE";
  if (order.status === "PRINTED") return "BILL";
  if (order.kots.some((k) => k.status === "READY")) return "READY";
  if (order.kots.some((k) => ["NEW", "PRINTED", "IN_PROGRESS", "READY_FOR_PICKUP"].includes(k.status))) return "KOT";
  if (order.items.length > 0) return "TAKING";
  return "SEATED";
}
