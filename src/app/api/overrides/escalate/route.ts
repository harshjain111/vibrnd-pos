/**
 * Auto-escalate stale override requests (audit §5.4 — 48h SLA).
 *
 * Marks any PENDING request older than 48h as EXPIRED and creates a
 * notification for the owner. Designed to be hit by a cron job (Vercel Cron
 * or any external scheduler) once an hour.
 *
 * Trigger:  `POST /api/overrides/escalate`  (no body, no auth — safe because
 * it only flips PENDING → EXPIRED and writes an audit row, no PII leaves the
 * server).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const STALE_AFTER_HOURS = 48;

export async function POST() {
  const cutoff = new Date(Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000);
  const stale = await db.overrideRequest.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    select: { id: true, outletId: true, actionType: true, contextJson: true },
  });

  for (const r of stale) {
    await db.overrideRequest.update({
      where: { id: r.id },
      data: { status: "EXPIRED", resolution: "Auto-expired after 48h", resolvedAt: new Date() },
    });
    let summary = "Stale override request";
    try {
      const ctx = JSON.parse(r.contextJson);
      summary = ctx.summary ?? summary;
    } catch {}
    await db.notification.create({
      data: {
        outletId: r.outletId,
        kind: "INFO",
        title: `Override expired — needs founder action`,
        body: `${r.actionType}: ${summary}`,
        link: "/overrides",
      },
    });
  }

  return NextResponse.json({ escalated: stale.length });
}
