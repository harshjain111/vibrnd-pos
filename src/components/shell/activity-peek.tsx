"use client";
import * as React from "react";
import Link from "next/link";
import { Activity, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  action: string;
  entity: string;
  summary: string;
  actor: string;
  createdAt: string;
};

/**
 * Top-bar "recent activity" peek (audit §5.6).
 *
 * One click opens a dropdown showing the last 10 audit log events for this
 * outlet. Auto-refreshes every 30s while open. Click "View all" → /logs.
 */
export function ActivityPeek() {
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const fetchRows = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/activity").then((x) => x.json());
      setRows(r.rows ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    fetchRows();
    const t = setInterval(fetchRows, 30_000);
    return () => clearInterval(t);
  }, [open, fetchRows]);

  // Close on outside-click.
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Recent activity"
        className="hidden sm:inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-accent"
      >
        <Activity className={cn("h-4 w-4", open && "text-primary")} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border bg-card shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b flex items-center justify-between">
            <div className="text-sm font-semibold">Recent activity</div>
            <Link href="/logs" onClick={() => setOpen(false)} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && rows.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No activity yet.</div>
            ) : (
              <ul>
                {rows.map((r) => (
                  <li key={r.id} className="px-3 py-2 border-b last:border-0 text-xs">
                    <div className="flex items-start gap-1.5">
                      <ActionDot action={r.action} />
                      <div className="flex-1 min-w-0">
                        <div className="text-foreground">{r.summary}</div>
                        <div className="text-muted-foreground mt-0.5">
                          {r.entity} · {r.actor} · {timeAgo(r.createdAt)}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionDot({ action }: { action: string }) {
  const tone =
    action === "SETTLE" ? "bg-emerald-500"
    : action === "CANCEL" ? "bg-rose-500"
    : action === "REJECT" ? "bg-rose-500"
    : action === "ACCEPT" ? "bg-sky-500"
    : action === "UPDATE" ? "bg-amber-500"
    : action === "CREATE" ? "bg-blue-500"
    : action === "DELETE" ? "bg-rose-700"
    : "bg-muted-foreground";
  return <span className={cn("h-2 w-2 rounded-full mt-1.5 shrink-0", tone)} />;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
