"use client";
import * as React from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { attachAutoDrain, drain, peekCount } from "@/lib/offline-outbox";

/**
 * Top-bar pill showing online / offline state (audit B9 + TASK 7) and the
 * number of mutations queued in the offline outbox (TASK 28). Also registers
 * the PWA service worker so the app becomes installable from Chrome / Safari.
 */
export function SyncStatusPill() {
  const [online, setOnline] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [queued, setQueued] = React.useState(0);

  React.useEffect(() => {
    setOnline(navigator.onLine);
    peekCount().then(setQueued).catch(() => {});
    attachAutoDrain();

    const goOnline = async () => {
      setSyncing(true);
      setOnline(true);
      try {
        await drain();
        setQueued(await peekCount());
      } catch {}
      setTimeout(() => setSyncing(false), 1200);
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    // Poll the queue every 10s for the count badge.
    const poll = setInterval(() => peekCount().then(setQueued).catch(() => {}), 10000);

    // Register the service worker (no-op if already registered).
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(poll);
    };
  }, []);

  let tone: "green" | "amber" | "blue" = "green";
  let label = "Online";
  let Icon: typeof Wifi = Wifi;
  if (!online) {
    tone = "amber";
    label = queued > 0 ? `Offline · ${queued} queued` : "Offline";
    Icon = WifiOff;
  } else if (syncing) {
    tone = "blue";
    label = "Syncing…";
    Icon = RefreshCw;
  } else if (queued > 0) {
    tone = "blue";
    label = `${queued} queued`;
    Icon = RefreshCw;
  }

  return (
    <span
      title={
        online
          ? "Connected. All actions sync immediately."
          : "You're offline. Actions queue locally and sync when you reconnect."
      }
      className={cn(
        "hidden md:inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full border",
        tone === "green" && "bg-emerald-50 border-emerald-200 text-emerald-800",
        tone === "amber" && "bg-amber-50 border-amber-200 text-amber-800",
        tone === "blue" && "bg-sky-50 border-sky-200 text-sky-800"
      )}
    >
      <Icon className={cn("h-3 w-3", syncing && "animate-spin")} />
      {label}
    </span>
  );
}
