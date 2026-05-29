import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "./client";

export const dynamic = "force-dynamic";

export default async function KotPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const outlet = await getActiveOutlet();
  const ticket = await db.kitchenTicket.findFirst({
    where: { id, outletId: outlet.id },
    include: { lines: true, order: { include: { table: true, customer: true } } },
  });
  if (!ticket) return notFound();

  return (
    <div className="flex flex-col items-center pt-10 pb-20">
      <div className="no-print w-full max-w-md mb-4 px-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/orders/kot">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
        <PrintButton />
      </div>

      <div className="print-receipt bg-white border rounded-md p-4 w-[72mm] font-mono text-[11px] leading-tight">
        <div className="center">
          <div className="bold" style={{ fontSize: 14 }}>{outlet.name}</div>
          <div className="small">KITCHEN ORDER TICKET</div>
        </div>
        <hr />
        <div className="row small">
          <span>KOT</span>
          <span className="bold">{ticket.kotNo}</span>
        </div>
        <div className="row small">
          <span>Order</span>
          <span>{ticket.order.invoiceNo}</span>
        </div>
        <div className="row small">
          <span>Time</span>
          <span>{new Date(ticket.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</span>
        </div>
        <div className="row small">
          <span>Type</span>
          <span>{ticket.order.orderType.replace("_", " ")}</span>
        </div>
        {ticket.order.table && (
          <div className="row small">
            <span>Table</span>
            <span>{ticket.order.table.name}</span>
          </div>
        )}
        {ticket.order.customer && (
          <div className="row small">
            <span>Customer</span>
            <span>{ticket.order.customer.name}</span>
          </div>
        )}
        <div className="row small">
          <span>Station</span>
          <span className="bold">{ticket.station}</span>
        </div>
        <hr />
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Item</th>
              <th style={{ textAlign: "right", width: 40 }}>Qty</th>
            </tr>
          </thead>
          <tbody>
            {ticket.lines.map((l) => (
              <tr key={l.id}>
                <td style={{ verticalAlign: "top" }}>
                  <div>{l.name}</div>
                  {l.note && <div className="small" style={{ paddingLeft: 6, fontSize: 10 }}>· {l.note}</div>}
                </td>
                <td style={{ textAlign: "right", verticalAlign: "top" }} className="bold">{l.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ticket.notes && (
          <>
            <hr />
            <div className="small">
              <span className="bold">Note: </span>
              {ticket.notes}
            </div>
          </>
        )}
        <hr />
        <div className="center small">— end —</div>
      </div>
    </div>
  );
}
