import { HelpCircle, Search } from "lucide-react";
import { getActiveOutlet, listAccessibleOutlets } from "@/lib/outlet";
import { getSessionUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "./notification-bell";
import { StoreStatusToggle } from "./store-status";
import { AskAiButton } from "./ask-ai";
import { OutletSwitcher } from "./outlet-switcher";
import { MenuButton } from "./sidebar-shell";
import { SyncStatusPill } from "./sync-status";
import { ActivityPeek } from "./activity-peek";

export async function Topbar() {
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const accessible = user ? await listAccessibleOutlets(user.outletId, user.role) : [outlet];

  return (
    <header className="min-h-14 border-b bg-background sticky top-0 z-30 flex flex-wrap items-center px-3 md:px-4 gap-2 py-2">
      <MenuButton />
      <div className="flex items-center gap-2 min-w-0 flex-1 lg:flex-initial">
        <OutletSwitcher
          active={{ id: outlet.id, name: outlet.name, code: outlet.code }}
          options={accessible.map((o) => ({ id: o.id, name: o.name, code: o.code }))}
          canManage={user?.role === "OWNER"}
        />
        <StoreStatusToggle open={outlet.storeOpen} />
      </div>

      <div className="ml-auto flex items-center gap-1.5 md:gap-2 shrink-0">
        <form action="/search" method="GET" className="relative hidden xl:block">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            placeholder="Search orders, items, customers…"
            className="h-8 w-72 rounded-md border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </form>

        <SyncStatusPill />
        <ActivityPeek />
        <AskAiButton />
        <NotificationBell outletId={outlet.id} />
        <Button variant="ghost" size="icon" aria-label="Help" className="hidden sm:inline-flex">
          <HelpCircle className="h-4 w-4" />
        </Button>
        {user && (
          <Badge
            variant="outline"
            className="hidden sm:inline-flex text-[10px] uppercase tracking-wider font-semibold"
            title={`Signed in as ${user.role}`}
          >
            {user.role}
          </Badge>
        )}
        {user && <UserMenu name={user.name} email={user.email} role={user.role} />}
      </div>
    </header>
  );
}
