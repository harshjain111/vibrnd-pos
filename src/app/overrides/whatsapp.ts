/**
 * WhatsApp escalation deep-link helper (audit §5.4).
 *
 * Produces a wa.me URL with a prefilled, URL-encoded message. The owner taps
 * this from a rejected/stale override row to ping the Founder for sign-off
 * without leaving Vibrnd. Real WhatsApp Business templates can replace this
 * later — the surface area (one function) stays the same.
 */
export function whatsappEscalationUrl(opts: {
  phone?: string | null;
  actionType: string;
  summary: string;
  invoiceNo?: string;
  amount?: number;
  reason?: string;
  outletName?: string;
}): string {
  const text = [
    `🚨 Vibrnd POS — escalation needed`,
    opts.outletName ? `Outlet: ${opts.outletName}` : null,
    `Action: ${opts.actionType}`,
    opts.invoiceNo ? `Bill: ${opts.invoiceNo}` : null,
    typeof opts.amount === "number" ? `Amount: ₹${opts.amount.toLocaleString("en-IN")}` : null,
    `Reason: ${opts.summary}`,
    opts.reason ? `Manager note: ${opts.reason}` : null,
    `Reply APPROVE or REJECT to action this.`,
  ]
    .filter(Boolean)
    .join("\n");
  const phone = (opts.phone ?? "").replace(/\D/g, "");
  const base = phone ? `https://wa.me/${phone}` : `https://wa.me/`;
  return `${base}?text=${encodeURIComponent(text)}`;
}
