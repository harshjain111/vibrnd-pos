/**
 * Recent activity peek — audit §5.6.
 * Last 10 audit log events for the current outlet, lightweight payload.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ rows: [] });
  try {
    const outlet = await getActiveOutlet();
    const rows = await db.activityLog.findMany({
      where: { outletId: outlet.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        action: true,
        entity: true,
        summary: true,
        actor: true,
        createdAt: true,
      },
    });
    return NextResponse.json({
      rows: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entity: r.entity,
        summary: r.summary,
        actor: r.actor,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch {
    return NextResponse.json({ rows: [] });
  }
}
