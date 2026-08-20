import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { getActiveOutlet } from "@/lib/outlet";
import { ensureKitchens, loadBoard } from "@/lib/kds/loader";
import { KdsBoard } from "./board-client";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { HelpCircle, History } from "lucide-react";

export const dynamic = "force-dynamic";

// KDS v2 board. Three URL modes per spec §3:
//   /kds                    → Control (default — chef taps here)
//   /kds?mode=display       → Display (read-only wall screen)
//   /kds?kitchen=<code>     → picks the kitchen; auto-picks the first if
//                              absent.
export default async function KdsPage({
  searchParams,
}: {
  searchParams: Promise<{ kitchen?: string; mode?: "display" | "control" }>;
}) {
  await requireUser("BILLER");
  const sp = await searchParams;
  const mode = sp.mode === "display" ? "display" : "control";
  const outlet = await getActiveOutlet();
  const kitchens = await ensureKitchens(outlet.id);
  const kitchen = kitchens.find((k) => k.code === sp.kitchen) ?? kitchens[0];

  const { board, cancelledAlerts, serverTime } = await loadBoard({
    outletId: outlet.id,
    kitchenId: kitchen.id,
  });

  return (
    <div className={mode === "display" ? "" : "space-y-3"}>
      {mode === "control" && (
        <PageHeader
          title={`${kitchen.name} · KDS`}
          description={`${outlet.name} · ${mode.toUpperCase()} screen · server time ${new Date(serverTime).toLocaleTimeString("en-IN")}`}
          actions={
            <>
              {kitchens.length > 1 && (
                <div className="flex items-center gap-1 text-xs">
                  {kitchens.map((k) => (
                    <Link
                      key={k.id}
                      href={{ pathname: "/kds", query: { kitchen: k.code, ...(sp.mode ? { mode: sp.mode } : {}) } }}
                      className={
                        "rounded-md border px-2 py-0.5 " +
                        (k.id === kitchen.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")
                      }
                    >
                      {k.name}
                    </Link>
                  ))}
                </div>
              )}
              <Button variant="ghost" size="sm" asChild>
                <Link href="/kds/history">
                  <History className="h-4 w-4" />
                  History
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href={{ pathname: "/kds", query: { kitchen: kitchen.code, mode: "display" } }}>
                  Display mode
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/kds/guide">
                  <HelpCircle className="h-4 w-4" />
                  Guide
                </Link>
              </Button>
            </>
          }
        />
      )}

      <KdsBoard
        mode={mode}
        kitchenName={kitchen.name}
        outletName={outlet.name}
        board={board}
        cancelledAlerts={cancelledAlerts}
        serverTime={serverTime}
      />
    </div>
  );
}
