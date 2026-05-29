"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { logActivity } from "@/lib/audit";

const F = z.object({
  category: z.enum(["FOOD", "SERVICE", "AMBIANCE", "DELIVERY", "OTHER"]),
  rating: z.coerce.number().int().min(1).max(5),
  text: z.string().optional(),
  customerPhone: z.string().optional(),
  orderInvoiceNo: z.string().optional(),
});

export async function saveFeedback(fd: FormData) {
  const outlet = await getActiveOutlet();
  const parsed = F.parse({
    category: fd.get("category"),
    rating: fd.get("rating"),
    text: fd.get("text") || undefined,
    customerPhone: fd.get("customerPhone") || undefined,
    orderInvoiceNo: fd.get("orderInvoiceNo") || undefined,
  });

  let customerId: string | undefined;
  let orderId: string | undefined;

  if (parsed.customerPhone) {
    const c = await db.customer.findFirst({ where: { id: `cust-${parsed.customerPhone}`, outletId: outlet.id } });
    if (c) customerId = c.id;
  }
  if (parsed.orderInvoiceNo) {
    const o = await db.order.findFirst({ where: { invoiceNo: parsed.orderInvoiceNo, outletId: outlet.id } });
    if (o) orderId = o.id;
  }

  const fb = await db.feedback.create({
    data: {
      category: parsed.category,
      rating: parsed.rating,
      text: parsed.text,
      customerId,
      orderId,
      outletId: outlet.id,
    },
  });

  await logActivity({
    action: "CREATE",
    entity: "Customer",
    entityId: fb.id,
    summary: `Feedback ${parsed.category} ${parsed.rating}★${parsed.text ? ` — "${parsed.text.slice(0, 60)}"` : ""}`,
    outletId: outlet.id,
  });

  revalidatePath("/feedback");
  revalidatePath("/logs");
}

const Resolve = z.object({
  id: z.string(),
  note: z.string().optional(),
});

export async function resolveFeedback(fd: FormData) {
  const outlet = await getActiveOutlet();
  const parsed = Resolve.parse({
    id: fd.get("id"),
    note: fd.get("note") || undefined,
  });
  const updated = await db.feedback.update({
    where: { id: parsed.id },
    data: { resolved: true, resolvedNote: parsed.note },
  });
  await logActivity({
    action: "UPDATE",
    entity: "Customer",
    entityId: parsed.id,
    summary: `Resolved feedback (${updated.category} ${updated.rating}★)${parsed.note ? ` — ${parsed.note}` : ""}`,
    outletId: outlet.id,
  });
  revalidatePath("/feedback");
  revalidatePath("/logs");
}

export async function deleteFeedback(fd: FormData) {
  const id = String(fd.get("id"));
  if (!id) return;
  await db.feedback.delete({ where: { id } });
  revalidatePath("/feedback");
}
