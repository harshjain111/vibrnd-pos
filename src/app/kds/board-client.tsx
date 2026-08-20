"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { AlarmClock, AlertTriangle, Hand, Pause, Play } from "lucide-react";
import type { Board, BoardColumn, Tile } from "@/lib/kds/types";
import { renderComment } from "@/lib/kds/comments";
import {
  bandFor,
  elapsedSeconds,
  formatCookingTimer,
  formatHoldCountdown,
  formatTicketTimer,
  ticketTargetSeconds,
} from "@/lib/kds/timer";
import type { CancelledAlert } from "@/lib/kds/loader";
import {
  ackCancellation,
  fireItem,
  holdItem,
  recallItem,
  tapItemForward,
  undoTap,
} from "./v2-actions";

type ToastState = {
  itemId: string;
  fromStatus: "NEW" | "PREPARING" | "READY" | "HELD";
  label: string;
  expiresAt: number;
} | null;

export function KdsBoard({
  mode,
  kitchenName,
  outletName,
  board,
  cancelledAlerts,
  serverTime,
}: {
  mode: "display" | "control";
  kitchenName: string;
  outletName: string;
  board: Board;
  cancelledAlerts: CancelledAlert[];
  serverTime: string;
}) {
  const router = useRouter();

  // Local clock offset from the server clock. Every 10 s we'll refetch
  // the board via router.refresh(); that arrives with a fresh serverTime
  // so drift stays bounded.
  const clockOffsetMs = React.useMemo(
    () => Date.parse(serverTime) - Date.now(),
    [serverTime],
  );
  const now = useTick();
  const nowWithOffset = React.useMemo(
    () => new Date(now.getTime() + clockOffsetMs),
    [now, clockOffsetMs],
  );

  // Auto-refresh every 5 s. Keeps things live enough for a chef without
  // hammering the server; the real prod deploy swaps this for the
  // WebSocket path from spec §23.
  React.useEffect(() => {
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [router]);

  // UNDO bar state. Only the most-recent tap is undoable per §11.
  const [toast, setToast] = React.useState<ToastState>(null);
  React.useEffect(() => {
    if (!toast) return;
    const ms = Math.max(0, toast.expiresAt - Date.now());
    const id = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(id);
  }, [toast]);

  const readOnly = mode === "display";

  const handleTap = React.useCallback(
    async (tile: Tile, itemId: string, currentStatus: "NEW" | "PREPARING" | "READY" | "HELD", name: string) => {
      if (readOnly) return;
      if (currentStatus === "HELD") return; // fire first
      // Optimistic UX: show UNDO immediately, then post.
      setToast({
        itemId,
        fromStatus: currentStatus,
        label: `${name} → ${nextLabel(currentStatus)}`,
        expiresAt: Date.now() + 5000,
      });
      const fd = new FormData();
      fd.set("itemId", itemId);
      const r = await tapItemForward(fd);
      if (!r.ok) {
        setToast(null);
        alert(`${r.message} (${r.code})`);
      }
      router.refresh();
    },
    [readOnly, router],
  );

  const handleUndo = React.useCallback(async () => {
    if (!toast) return;
    const fd = new FormData();
    fd.set("itemId", toast.itemId);
    fd.set("toStatus", toast.fromStatus);
    await undoTap(fd);
    setToast(null);
    router.refresh();
  }, [toast, router]);

  const totals = React.useMemo(() => {
    let live = 0;
    let items = 0;
    for (const col of ["NEW", "PREPARING", "READY"] as BoardColumn[]) {
      for (const t of board[col]) {
        live++;
        items += t.items.reduce((s, i) => s + i.qty, 0);
      }
    }
    return { live, items };
  }, [board]);

  return (
    <div className={mode === "display" ? "min-h-screen bg-slate-950 text-white p-4" : ""}>
      {/* Display screen top bar (§4 fig 4.1). Control screen has its own
          PageHeader in the parent. */}
      {mode === "display" && (
        <div className="flex items-center justify-between mb-3 text-xs uppercase tracking-widest">
          <div className="flex items-center gap-3">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-300">{kitchenName} · {outletName}</span>
          </div>
          <div className="flex items-center gap-4 text-slate-300">
            <span>LIVE {totals.live} tickets · {totals.items} items</span>
            <span>{new Date(nowWithOffset).toLocaleTimeString("en-IN", { hour12: false })}</span>
          </div>
        </div>
      )}

      {/* Cancelled alert banner + tickets — pinned above the board (§13.1) */}
      {cancelledAlerts.length > 0 && (
        <div className="mb-3">
          {cancelledAlerts.map((a) => (
            <CancelledBanner
              key={a.kotId}
              alert={a}
              readOnly={readOnly}
              onAck={async (wasWasted) => {
                const fd = new FormData();
                fd.set("kotId", a.kotId);
                if (wasWasted !== undefined) fd.set("wasWasted", String(wasWasted));
                await ackCancellation(fd);
                router.refresh();
              }}
            />
          ))}
        </div>
      )}

      {/* Four columns per §4.1. Display shows all four; Control per §3
          shows all four too (SERVED lives in History for hard-line
          Control-mode adherence, but we keep it inline here so demos
          see the whole lifecycle). */}
      <div className="grid grid-cols-4 gap-3">
        <Column
          title="New"
          count={board.NEW.length}
          tint="rose"
          nowMs={nowWithOffset.getTime()}
          tiles={board.NEW}
          onTap={handleTap}
          onHold={async (itemId, mins) => {
            const fd = new FormData(); fd.set("itemId", itemId); fd.set("minutes", String(mins)); await holdItem(fd); router.refresh();
          }}
          onFire={async (itemId) => {
            const fd = new FormData(); fd.set("itemId", itemId); await fireItem(fd); router.refresh();
          }}
          onRecall={async (itemId) => {
            const fd = new FormData(); fd.set("itemId", itemId); await recallItem(fd); router.refresh();
          }}
          readOnly={readOnly}
        />
        <Column
          title="Preparing"
          count={board.PREPARING.length}
          tint="amber"
          nowMs={nowWithOffset.getTime()}
          tiles={board.PREPARING}
          onTap={handleTap}
          onHold={async () => {}}
          onFire={async () => {}}
          onRecall={async (itemId) => {
            const fd = new FormData(); fd.set("itemId", itemId); await recallItem(fd); router.refresh();
          }}
          readOnly={readOnly}
        />
        <Column
          title="Ready"
          count={board.READY.length}
          tint="emerald"
          nowMs={nowWithOffset.getTime()}
          tiles={board.READY}
          onTap={handleTap}
          onHold={async () => {}}
          onFire={async () => {}}
          onRecall={async (itemId) => {
            const fd = new FormData(); fd.set("itemId", itemId); await recallItem(fd); router.refresh();
          }}
          readOnly={readOnly}
        />
        <Column
          title="Served"
          count={board.SERVED.length}
          tint="sky"
          nowMs={nowWithOffset.getTime()}
          tiles={board.SERVED}
          onTap={handleTap}
          onHold={async () => {}}
          onFire={async () => {}}
          onRecall={async (itemId) => {
            const fd = new FormData(); fd.set("itemId", itemId); await recallItem(fd); router.refresh();
          }}
          readOnly={readOnly}
        />
      </div>

      {/* UNDO bar (§11) — 5-second reversal */}
      {!readOnly && toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white rounded-md shadow-lg px-4 py-2 flex items-center gap-3 z-50">
          <span className="text-sm">{toast.label}</span>
          <Button size="sm" variant="secondary" onClick={handleUndo}>Undo</Button>
        </div>
      )}
    </div>
  );
}

// ─── Column ──────────────────────────────────────────────────────────

function Column({
  title,
  count,
  tint,
  tiles,
  nowMs,
  onTap,
  onHold,
  onFire,
  onRecall,
  readOnly,
}: {
  title: string;
  count: number;
  tint: "rose" | "amber" | "emerald" | "sky";
  tiles: Tile[];
  nowMs: number;
  onTap: (tile: Tile, itemId: string, currentStatus: "NEW" | "PREPARING" | "READY" | "HELD", name: string) => void | Promise<void>;
  onHold: (itemId: string, minutes: number) => void | Promise<void>;
  onFire: (itemId: string) => void | Promise<void>;
  onRecall: (itemId: string) => void | Promise<void>;
  readOnly: boolean;
}) {
  const headerTint = {
    rose: "bg-rose-100 text-rose-900 border-rose-300",
    amber: "bg-amber-100 text-amber-900 border-amber-300",
    emerald: "bg-emerald-100 text-emerald-900 border-emerald-300",
    sky: "bg-sky-100 text-sky-900 border-sky-300",
  }[tint];
  return (
    <div className="flex flex-col gap-2 min-h-[400px]">
      <div className={`rounded-md border-2 px-3 py-1.5 flex items-center justify-between ${headerTint}`}>
        <span className="text-sm font-bold uppercase tracking-wider">{title}</span>
        <span className="text-xs font-mono">{count}</span>
      </div>
      <div className="space-y-2">
        {tiles.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-6">
            ✓ clear
          </div>
        ) : (
          tiles.map((t) => (
            <TileCard
              key={`${t.kotId}-${t.column}`}
              tile={t}
              nowMs={nowMs}
              onTap={onTap}
              onHold={onHold}
              onFire={onFire}
              onRecall={onRecall}
              readOnly={readOnly}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Tile (spec §5) ───────────────────────────────────────────────────

function TileCard({
  tile,
  nowMs,
  onTap,
  onHold,
  onFire,
  onRecall,
  readOnly,
}: {
  tile: Tile;
  nowMs: number;
  onTap: (tile: Tile, itemId: string, currentStatus: "NEW" | "PREPARING" | "READY" | "HELD", name: string) => void | Promise<void>;
  onHold: (itemId: string, minutes: number) => void | Promise<void>;
  onFire: (itemId: string) => void | Promise<void>;
  onRecall: (itemId: string) => void | Promise<void>;
  readOnly: boolean;
}) {
  const targetSecs = ticketTargetSeconds(tile.items);
  const elapsed = elapsedSeconds(tile.timerFrom, tile.heldMs, new Date(nowMs));
  const band = bandFor(elapsed, targetSecs);
  const timerLabel = formatTicketTimer(elapsed, targetSecs);
  const bandClass = {
    ON_TIME: "text-slate-900",
    GETTING_CLOSE: "text-amber-700",
    LATE: "text-rose-700",
    VERY_LATE: "text-rose-800 animate-pulse",
    ON_HOLD: "text-slate-500",
  }[band];

  return (
    <div
      className={
        "rounded-md border bg-card shadow-sm " +
        (tile.isRush ? "border-l-4 border-l-rose-500 " : "")
      }
    >
      {/* Allergy strip (§5 top) */}
      {tile.allergyNote && (
        <div className="bg-rose-600 text-white text-xs font-bold uppercase px-2 py-1 rounded-t-md flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3" /> Allergy — {tile.allergyNote}
        </div>
      )}

      {/* Header (§5 header) */}
      <div className="px-2.5 pt-2 pb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-mono font-bold text-sm">
              {tile.kotNo}
            </span>
            {tile.isRush && <Badge variant="destructive" className="text-[9px]">RUSH</Badge>}
            {tile.isSplit && (
              <Badge variant="outline" className="text-[9px]">
                {tile.splitLabel}
              </Badge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {tile.tableLabel ?? (tile.tokenNo ? `Token ${tile.tokenNo}` : "Walk-in")}
            {tile.captainName ? ` · ${tile.captainName}` : ""}
            {tile.guestCount ? ` · ${tile.guestCount} guests` : ""}
          </div>
        </div>
        <div className={`font-mono font-bold text-lg tabular-nums ${bandClass}`}>
          {timerLabel}
        </div>
      </div>

      {/* Items */}
      <div className="px-2.5 pb-2 space-y-1.5">
        {tile.items.map((it) => (
          <ItemRow
            key={it.id}
            item={it}
            column={tile.column}
            nowMs={nowMs}
            onTap={() => onTap(tile, it.id, tile.column === "SERVED" ? "READY" : (it.status as any), it.name)}
            onHold={(mins) => onHold(it.id, mins)}
            onFire={() => onFire(it.id)}
            onRecall={() => onRecall(it.id)}
            readOnly={readOnly}
          />
        ))}
      </div>

      {/* KOT-level note (§5.1 4th line — always at bottom of items) */}
      {tile.kotNote && (
        <div className="mx-2.5 mb-2 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[11px] p-1.5">
          <b>KOT note:</b> {tile.kotNote}
        </div>
      )}

      {/* Link bar on split tiles (§5.9 / §9 S5) */}
      {tile.isSplit && tile.linkText && (
        <div className="mx-2.5 mb-2 rounded bg-muted/40 text-[11px] p-1.5">
          {tile.linkText}
        </div>
      )}

      {/* Waiting-for-others hint on Ready tile (§9 S7) */}
      {tile.column === "READY" && tile.waitingForOthers && (
        <div className="mx-2.5 mb-2 text-[11px] text-amber-800">
          Waiting for more items — captain not called yet
        </div>
      )}
      {tile.column === "READY" && tile.isFinalReady && (
        <div className="mx-2.5 mb-2 text-[11px] text-emerald-800 font-semibold">
          ✓ {tile.captainName ?? "Captain"} notified — pick up
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  column,
  nowMs,
  onTap,
  onHold,
  onFire,
  onRecall,
  readOnly,
}: {
  item: import("@/lib/kds/types").KotItemSnapshot;
  column: BoardColumn;
  nowMs: number;
  onTap: () => void | Promise<void>;
  onHold: (minutes: number) => void | Promise<void>;
  onFire: () => void | Promise<void>;
  onRecall: () => void | Promise<void>;
  readOnly: boolean;
}) {
  const isHeld = item.status === "HELD";
  const isPreparing = item.status === "PREPARING";
  return (
    <div
      className={
        "border rounded-md p-2 text-sm " +
        (isHeld ? "opacity-60 bg-stripes " : "hover:bg-accent/40 ") +
        (readOnly || isHeld ? "cursor-default" : "cursor-pointer active:scale-[0.99]")
      }
      onClick={() => {
        if (readOnly) return;
        if (isHeld) return;
        onTap();
      }}
    >
      <div className="flex items-baseline gap-2">
        <span className={"inline-block w-3 h-3 border rounded-sm shrink-0 " + (item.isVeg ? "border-emerald-600" : "border-rose-600")}>
          <span className={"block w-1.5 h-1.5 rounded-full m-[3px] " + (item.isVeg ? "bg-emerald-600" : "bg-rose-600")} />
        </span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{item.qty}</span>
        <span className="font-medium">{item.name}</span>
        {item.isRecalled && (
          <Badge variant="secondary" className="text-[9px]">↺ RECALL</Badge>
        )}
      </div>
      {/* Comments verbatim per §6 — amber, single wrapped line */}
      {item.comments.length > 0 && (
        <div className="mt-1 ml-5 text-[11px] text-amber-800 leading-snug">
          {item.comments.map((c, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-1 text-amber-500">·</span>}
              {c.type === "REMOVE" ? (
                <b>{renderComment(c)}</b>
              ) : (
                renderComment(c)
              )}
            </span>
          ))}
        </div>
      )}
      {item.portion && (
        <div className="ml-5 text-[10px] text-muted-foreground mt-0.5">
          {item.portion}
        </div>
      )}
      {isPreparing && item.startedAt && (
        <div className="ml-5 text-[10px] text-muted-foreground mt-0.5">
          Cooking {formatCookingTimer(item.startedAt, new Date(nowMs))}
        </div>
      )}
      {isHeld && item.holdUntil && (
        <div className="ml-5 text-[10px] text-amber-800 mt-0.5 inline-flex items-center gap-1">
          <Pause className="h-3 w-3" /> On hold — fires in {formatHoldCountdown(item.holdUntil, new Date(nowMs))}
        </div>
      )}
      {/* Per-item quick actions (§10) — only on Control mode */}
      {!readOnly && column === "NEW" && !isHeld && (
        <div className="mt-1.5 flex gap-1">
          <button
            type="button"
            className="text-[10px] px-1.5 py-0.5 rounded border hover:bg-accent"
            onClick={(e) => { e.stopPropagation(); onHold(15); }}
          >
            <Hand className="h-2.5 w-2.5 inline mr-0.5" /> Hold 15m
          </button>
        </div>
      )}
      {!readOnly && isHeld && (
        <div className="mt-1.5 flex gap-1">
          <button
            type="button"
            className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-100 border-amber-300 hover:bg-amber-200"
            onClick={(e) => { e.stopPropagation(); onFire(); }}
          >
            <Play className="h-2.5 w-2.5 inline mr-0.5" /> Fire now
          </button>
        </div>
      )}
      {!readOnly && (column === "READY" || column === "SERVED") && (
        <div className="mt-1.5 flex gap-1">
          <button
            type="button"
            className="text-[10px] px-1.5 py-0.5 rounded border hover:bg-accent"
            onClick={(e) => { e.stopPropagation(); onRecall(); }}
          >
            ↺ Recall
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Cancelled banner (§13) ──────────────────────────────────────────

function CancelledBanner({
  alert,
  readOnly,
  onAck,
}: {
  alert: CancelledAlert;
  readOnly: boolean;
  onAck: (wasWasted?: boolean) => void | Promise<void>;
}) {
  const anyPrepared = alert.items.some((i) => i.priorStatus === "PREPARING");
  return (
    <InlineAlert tone="bad" icon={<AlertTriangle className="h-4 w-4" />}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold uppercase">
            KOT {alert.kotNo} · {alert.tableLabel ?? "table"} · CANCELLED — STOP
          </div>
          <div className="text-xs text-rose-800 mt-0.5">
            {alert.items.map((i) => (
              <div key={i.itemId} className="line-through">
                {i.name}
                {i.comments.length > 0 && (
                  <span className="ml-2 not-line-through">
                    ({i.comments.map((c) => renderComment(c)).join(" · ")})
                  </span>
                )}
                <span className="ml-2 text-[10px] italic not-line-through">was {i.priorStatus}</span>
              </div>
            ))}
            {alert.reason && <div className="mt-1"><b>Reason:</b> {alert.reason}</div>}
          </div>
        </div>
        {!readOnly && (
          <div className="flex flex-col gap-1 shrink-0">
            {anyPrepared ? (
              <>
                <Button size="sm" variant="destructive" onClick={() => onAck(true)}>Wasted</Button>
                <Button size="sm" variant="outline" onClick={() => onAck(false)}>Stopped in time</Button>
              </>
            ) : (
              <Button size="sm" onClick={() => onAck()}>Acknowledge</Button>
            )}
          </div>
        )}
      </div>
    </InlineAlert>
  );
}

// ─── shared 1 Hz tick (§7.3) ─────────────────────────────────────────

function useTick(): Date {
  const [now, setNow] = React.useState<Date>(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function nextLabel(from: "NEW" | "PREPARING" | "READY" | "HELD"): string {
  return from === "NEW" ? "Preparing" : from === "PREPARING" ? "Ready" : from === "READY" ? "Served" : "—";
}
