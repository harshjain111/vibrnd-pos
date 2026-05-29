"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Volume2, VolumeX } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

/**
 * Auto-refresh + new-ticket detection for the KDS.
 * - Polls every `seconds` and calls router.refresh().
 * - On each render the parent passes `activeCount` (NEW + IN_PROGRESS + READY).
 *   When it grows between renders, beep + toast.
 */
export function AutoRefresh({ seconds = 20, activeCount }: { seconds?: number; activeCount: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [count, setCount] = React.useState(seconds);
  const [paused, setPaused] = React.useState(false);
  const [sound, setSound] = React.useState(true);
  const prevRef = React.useRef<number | null>(null);

  // Detect ticket-count growth (excluding first render).
  React.useEffect(() => {
    const prev = prevRef.current;
    if (prev !== null && activeCount > prev) {
      const delta = activeCount - prev;
      toast({
        variant: "success",
        title: delta === 1 ? "New ticket on the board" : `${delta} new tickets on the board`,
      });
      if (sound) beep();
    }
    prevRef.current = activeCount;
  }, [activeCount, sound, toast]);

  React.useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          router.refresh();
          return seconds;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [paused, router, seconds]);

  return (
    <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <button
        onClick={() => setSound((s) => !s)}
        className="rounded p-1 hover:bg-accent"
        aria-label={sound ? "Mute" : "Unmute"}
        title={sound ? "Mute new-ticket beep" : "Unmute new-ticket beep"}
      >
        {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
      </button>
      <RefreshCw className={`h-3.5 w-3.5 ${paused ? "" : "animate-spin [animation-duration:2s]"}`} />
      <span>
        Auto-refresh in <span className="font-mono">{count}s</span>
      </span>
      <button
        className="underline underline-offset-2 hover:text-foreground"
        onClick={() => setPaused((p) => !p)}
      >
        {paused ? "resume" : "pause"}
      </button>
      <button
        className="underline underline-offset-2 hover:text-foreground"
        onClick={() => {
          setCount(seconds);
          router.refresh();
        }}
      >
        refresh now
      </button>
    </div>
  );
}

/** Two-tone beep using WebAudio — no audio asset needed. */
function beep() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const tones = [
      { f: 880, t: 0, dur: 0.12 },
      { f: 1320, t: 0.13, dur: 0.18 },
    ];
    for (const { f, t, dur } of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, ctx.currentTime + t);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + dur);
    }
    // Free the context after the sounds finish
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    /* ignore */
  }
}
