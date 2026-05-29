/**
 * KOT print stub per audit TASK 2 / TASK 14.
 *
 * The real implementation will POST to a local Print Agent at
 * http://localhost:9999/print (Sprint 2). For now we log the request and
 * return 200 so the UI can ship the Send-KOT flow.
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  // eslint-disable-next-line no-console
  console.log("[KOT print stub]", {
    orderId: body.orderId,
    kotNo: body.kotNo,
    station: body.station,
    lineCount: Array.isArray(body.lines) ? body.lines.length : 0,
    note: body.note,
  });
  return NextResponse.json({ ok: true, printedAt: new Date().toISOString() });
}
