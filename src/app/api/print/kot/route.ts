/**
 * KOT print endpoint.
 *
 * Items on a bill are split into one KitchenTicket per station (department).
 * The billing screen POSTs one request per station ticket; here we resolve the
 * printer(s) mapped to that station (Settings → KOT printers) and hand the job
 * to the local print agent.
 *
 * The physical agent integration (POST to http://localhost:9999/print) is the
 * Sprint-2 piece; for now we resolve the target printer(s), log the job, and
 * return them so the client knows where it went (or that a station is
 * unmapped).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}) as any);
  const station = String(body.station ?? "MAIN").toUpperCase();

  // Resolve the outlet from the order so we can find its printers.
  let outletId: string | null = null;
  if (body.orderId) {
    const order = await db.order.findUnique({
      where: { id: String(body.orderId) },
      select: { outletId: true },
    });
    outletId = order?.outletId ?? null;
  }

  const printers = outletId
    ? await db.printer.findMany({
        where: { outletId, station, active: true },
        select: { id: true, name: true, target: true },
      })
    : [];

  // eslint-disable-next-line no-console
  console.log("[KOT print]", {
    kotNo: body.kotNo,
    station,
    lineCount: Array.isArray(body.lines) ? body.lines.length : 0,
    routedTo: printers.map((p) => p.name),
  });

  // TODO (Sprint 2): for each printer, POST the formatted ticket to the local
  // print agent at printer.target (or the agent's default device for the
  // station when target is null).

  return NextResponse.json({
    ok: true,
    printedAt: new Date().toISOString(),
    station,
    printers,
    unmapped: printers.length === 0,
  });
}
