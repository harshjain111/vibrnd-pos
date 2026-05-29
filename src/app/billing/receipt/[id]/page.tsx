import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { inr, inr2 } from "@/lib/utils";
import { CheckCircle2, Plus } from "lucide-react";
import { PrintButton } from "./print-button";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const outlet = await getActiveOutlet();
  const order = await db.order.findUnique({
    where: { id },
    include: { items: true, customer: true, table: true },
  });
  if (!order) return notFound();

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Order settled"
          description={`Invoice ${order.invoiceNo}`}
          actions={
            <>
              <Button variant="outline" asChild>
                <Link href="/orders">View all orders</Link>
              </Button>
              <Button asChild>
                <Link href="/billing">
                  <Plus className="h-4 w-4" />
                  New bill
                </Link>
              </Button>
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
        {/* Left: order details (screen only) */}
        <Card className="no-print">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <div className="font-semibold">Payment successful</div>
                <div className="text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleString("en-IN")}</div>
              </div>
              <Badge variant="success" className="ml-auto">{order.status}</Badge>
            </div>

            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <Detail label="Order type" value={order.orderType.replace("_", " ")} />
              <Detail label="Channel" value={order.channel} />
              <Detail label="Payment" value={order.paymentMode ?? "—"} />
              <Detail label="Table" value={order.table?.name ?? "—"} />
              <Detail label="Customer" value={order.customer?.name ?? "Walk-in"} />
              <Detail label="Customer phone" value={order.customer?.phone ?? "—"} />
              {order.discountCode && <Detail label="Coupon" value={order.discountCode} />}
            </dl>

            <table className="w-full mt-6 text-sm">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Price</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((li) => {
                  let addons: { name: string; priceDelta: number }[] = [];
                  if (li.addonsJson) {
                    try {
                      addons = JSON.parse(li.addonsJson);
                    } catch {}
                  }
                  return (
                    <tr key={li.id} className="border-b last:border-0">
                      <td className="py-2">
                        <div>{li.name}</div>
                        {addons.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            + {addons.map((a) => `${a.name}${a.priceDelta ? ` ₹${a.priceDelta}` : ""}`).join(", ")}
                          </div>
                        )}
                      </td>
                      <td className="py-2 text-right">{li.qty}</td>
                      <td className="py-2 text-right">{inr2(li.price)}</td>
                      <td className="py-2 text-right">{inr2(li.price * li.qty)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Right: thermal receipt — also printed verbatim */}
        <Card>
          <CardContent className="p-6 print-receipt">
            <div className="center">
              <div className="bold" style={{ fontSize: 14 }}>
                {outlet.name}
              </div>
              <div className="small">{outlet.address ?? ""}</div>
              <div className="small">GSTIN: {outlet.gstin ?? "—"}</div>
              {outlet.fssai && <div className="small">FSSAI: {outlet.fssai}</div>}
            </div>
            <hr />
            <div className="row small">
              <span>Invoice</span>
              <span className="bold">{order.invoiceNo}</span>
            </div>
            <div className="row small">
              <span>Date</span>
              <span>{new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</span>
            </div>
            <div className="row small">
              <span>Type</span>
              <span>{order.orderType.replace("_", " ")}</span>
            </div>
            {order.table && (
              <div className="row small">
                <span>Table</span>
                <span>{order.table.name}</span>
              </div>
            )}
            {order.customer && (
              <div className="row small">
                <span>Customer</span>
                <span>{order.customer.name}</span>
              </div>
            )}
            <hr />
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Item</th>
                  <th style={{ textAlign: "right" }}>Qty</th>
                  <th style={{ textAlign: "right" }}>Amt</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((li) => {
                  let addons: { name: string; priceDelta: number }[] = [];
                  if (li.addonsJson) {
                    try {
                      addons = JSON.parse(li.addonsJson);
                    } catch {}
                  }
                  return (
                    <React.Fragment key={li.id}>
                      <tr>
                        <td>{li.name}</td>
                        <td style={{ textAlign: "right" }}>{li.qty}</td>
                        <td style={{ textAlign: "right" }}>{(li.price * li.qty).toFixed(2)}</td>
                      </tr>
                      {addons.length > 0 && (
                        <tr>
                          <td colSpan={3} className="small" style={{ paddingLeft: 6, fontSize: 10 }}>
                            + {addons.map((a) => `${a.name}${a.priceDelta ? ` ₹${a.priceDelta}` : ""}`).join(", ")}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            <hr />
            <div className="row">
              <span>Subtotal</span>
              <span>{inr2(order.subTotal)}</span>
            </div>
            <div className="row">
              <span>GST</span>
              <span>{inr2(order.taxTotal)}</span>
            </div>
            {order.discount > 0 && (
              <div className="row">
                <span>Discount{order.discountCode ? ` (${order.discountCode})` : ""}</span>
                <span>− {inr2(order.discount)}</span>
              </div>
            )}
            {order.tip > 0 && (
              <div className="row">
                <span>Tip</span>
                <span>{inr2(order.tip)}</span>
              </div>
            )}
            <hr />
            <div className="row bold" style={{ fontSize: 13 }}>
              <span>TOTAL</span>
              <span>{inr(order.grandTotal)}</span>
            </div>
            <div className="row small">
              <span>Paid via</span>
              <span>{order.paymentMode ?? "—"}</span>
            </div>
            <hr />
            <div className="center small">Thank you · Visit again</div>
            <div className="center small">Powered by Vibrnd POS</div>

            <div className="mt-4 no-print">
              <PrintButton />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </>
  );
}
