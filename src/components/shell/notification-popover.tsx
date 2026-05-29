"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, AlertTriangle, Inbox, Clock, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { markAllRead } from "@/app/notifications/actions";

type Item = {
  key: string;
  id: string;
  severity: "info" | "warning" | "destructive";
  title: string;
  detail: string;
  href: string;
  read: boolean;
};

export function NotificationPopover({ items, count }: { items: Item[]; count: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative h-9 w-9 rounded-md hover:bg-accent flex items-center justify-center"
        aria-label={`Notifications (${count})`}
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-80 rounded-md border bg-popover shadow-lg z-50">
          <div className="px-3 py-2 border-b flex items-center justify-between">
            <span className="text-sm font-medium">Notifications</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{count} new</Badge>
              {count > 0 && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  onClick={() => {
                    startTransition(async () => {
                      await markAllRead();
                      router.refresh();
                    });
                  }}
                  disabled={pending}
                >
                  <Check className="h-3 w-3" />
                  Mark all read
                </button>
              )}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              <Inbox className="h-5 w-5 mx-auto mb-2 opacity-60" />
              All clear.
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1">
              {items.map((i) => {
                const Icon =
                  i.severity === "destructive" ? AlertTriangle : i.severity === "warning" ? Clock : Bell;
                const tone =
                  i.severity === "destructive"
                    ? "text-rose-700"
                    : i.severity === "warning"
                    ? "text-amber-700"
                    : "text-sky-700";
                return (
                  <li key={i.key}>
                    <Link
                      href={i.href}
                      className={`flex items-start gap-2.5 px-3 py-2 hover:bg-accent ${i.read ? "opacity-60" : ""}`}
                      onClick={() => setOpen(false)}
                    >
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${tone}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {!i.read && <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500 mr-1.5 align-middle" />}
                          {i.title}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{i.detail}</div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="px-3 py-2 border-t text-center">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
