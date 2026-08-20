// KDS v2 — timer maths + colour bands. Zero I/O.
// Spec §7. One shared 1 Hz tick drives every visible timer at the UI
// layer; this module is the pure "given now, what does the tile show?".

export type TimerBand = "ON_TIME" | "GETTING_CLOSE" | "LATE" | "VERY_LATE" | "ON_HOLD";

const CAP_SECONDS = 60 * 60; // §7.3 cap the display at >60:00

/** Elapsed seconds for the KOT-level ticker on a tile. `heldMs` is
 *  subtracted so a 15-minute hold doesn't make the ticket look
 *  catastrophically late (§7.3). Cap at 60 min → the tile flags stale. */
export function elapsedSeconds(
  punchedAt: string | Date,
  heldMs: number,
  now: Date = new Date(),
): number {
  const punched = punchedAt instanceof Date ? punchedAt.getTime() : Date.parse(punchedAt);
  if (!Number.isFinite(punched)) return 0;
  const raw = Math.floor((now.getTime() - punched - Math.max(0, heldMs)) / 1000);
  return Math.max(0, raw);
}

/** Colour band for a running tile. `p = elapsed / targetSeconds`. */
export function bandFor(
  elapsed: number,
  targetSeconds: number,
  warningPct = 0.6,
  latePct = 1.0,
): TimerBand {
  if (targetSeconds <= 0) return "ON_TIME";
  const p = elapsed / targetSeconds;
  if (p >= latePct + 0.5) return "VERY_LATE"; // §7.2 pulses, manager alerted
  if (p >= latePct) return "LATE";
  if (p >= warningPct) return "GETTING_CLOSE";
  return "ON_TIME";
}

/** Formatter for the big number on the tile. Signed once late:
 *   before 100%: MM:SS   (how long it has taken)
 *   past  100%: -MM:SS   (how late it is) — spec §7.2 sign flip. */
export function formatTicketTimer(
  elapsed: number,
  targetSeconds: number,
): string {
  const overrun = elapsed - targetSeconds;
  if (overrun > 0 && targetSeconds > 0) {
    return `-${formatMmSs(Math.min(CAP_SECONDS, overrun))}`;
  }
  const capped = Math.min(CAP_SECONDS, elapsed);
  return formatMmSs(capped);
}

/** Item-level cooking timer (§7.1) — small grey sub-line on Control
 *  Screen only, "Cooking 00:36". Counts up from startedAt. */
export function formatCookingTimer(
  startedAt: string | Date,
  now: Date = new Date(),
): string {
  const t = startedAt instanceof Date ? startedAt.getTime() : Date.parse(startedAt);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((now.getTime() - t) / 1000));
  return formatMmSs(Math.min(CAP_SECONDS, s));
}

/** Hold countdown (§7.1) — counts down from now until hold_until. */
export function formatHoldCountdown(
  holdUntil: string | Date,
  now: Date = new Date(),
): string {
  const t = holdUntil instanceof Date ? holdUntil.getTime() : Date.parse(holdUntil);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((t - now.getTime()) / 1000));
  return formatMmSs(s);
}

/** Waiting-on-pass timer (§7.1) — shown on a Ready tile. Past 2 minutes
 *  it flips to "getting cold" tone. */
export function waitingOnPassSeconds(
  readyAt: string | Date,
  now: Date = new Date(),
): number {
  const t = readyAt instanceof Date ? readyAt.getTime() : Date.parse(readyAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 1000));
}

/** True when a Ready item has been sitting long enough that we should
 *  shout "getting cold" (§7.1 sub-two-minute grace). Default 120 s. */
export function isWaitingCold(readySeconds: number, coldAfter = 120): boolean {
  return readySeconds >= coldAfter;
}

// ─── helpers ──────────────────────────────────────────────────────────

function formatMmSs(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

/** Convenience — the target seconds for a tile is the LONGEST prep
 *  minutes among its items in this kitchen (§7.2). */
export function ticketTargetSeconds(
  items: { prepMinutes: number }[],
): number {
  let max = 0;
  for (const it of items) {
    const s = Math.max(0, Math.floor(it.prepMinutes * 60));
    if (s > max) max = s;
  }
  return max;
}
