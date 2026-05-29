"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { moveStock } from "@/lib/stock";
import { logActivity } from "@/lib/audit";

const Line = z.object({
  rawMaterialId: z.string(),
  qty: z.coerce.number().positive(),
  unit: z.string(),
  priceAtTransfer: z.coerce.number().nonnegative().default(0),
});

const Create = z.object({
  receiverOutletId: z.string(),
  challanNo: z.string().optional(),
  transferDate: z.string(),
  notes: z.string().optional(),
  lines: z.array(Line).min(1),
});

export async function createTransfer(input: z.infer<typeof Create>) {
  await requireUser("MANAGER");
  const data = Create.parse(input);
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  if (data.receiverOutletId === outlet.id) throw new Error("Receiver must be a different outlet");

  // Check sender has enough stock
  const rms = await db.rawMaterial.findMany({
    where: { id: { in: data.lines.map((l) => l.rawMaterialId) } },
  });
  const rmMap = new Map(rms.map((r) => [r.id, r]));
  for (const l of data.lines) {
    const rm = rmMap.get(l.rawMaterialId);
    if (!rm) throw new Error("Raw material not found");
    if (rm.outletId !== outlet.id) throw new Error(`${rm.name} doesn't belong to your outlet`);
    if (rm.currentQty < l.qty) throw new Error(`Sender only has ${rm.currentQty} ${rm.unit} of ${rm.name}`);
  }

  const transfer = await db.transfer.create({
    data: {
      challanNo: data.challanNo,
      transferDate: new Date(data.transferDate),
      status: "SENT",
      senderOutletId: outlet.id,
      receiverOutletId: data.receiverOutletId,
      sentById: user?.id ?? null,
      notes: data.notes,
      lines: {
        create: data.lines.map((l) => ({
          rawMaterialId: l.rawMaterialId,
          qtySent: l.qty,
          unit: l.unit,
          priceAtTransfer: l.priceAtTransfer,
        })),
      },
    },
  });

  // Sender stock decrements immediately
  for (const l of data.lines) {
    await moveStock({
      rawMaterialId: l.rawMaterialId,
      delta: -l.qty,
      reason: "TRANSFER_OUT",
      refType: "Transfer",
      refId: transfer.id,
      note: `Transfer to outlet ${data.receiverOutletId}`,
    });
  }

  await logActivity({
    action: "CREATE",
    entity: "Transfer",
    entityId: transfer.id,
    summary: `Sent transfer to outlet ${data.receiverOutletId} · ${data.lines.length} lines`,
    outletId: outlet.id,
  });
  revalidatePath("/inventory/transfers");
}

const Receive = z.object({
  transferId: z.string(),
  lines: z.array(z.object({ id: z.string(), qtyReceived: z.coerce.number().nonnegative() })),
});

export async function receiveTransfer(input: z.infer<typeof Receive>) {
  await requireUser("MANAGER");
  const data = Receive.parse(input);
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const transfer = await db.transfer.findUnique({
    where: { id: data.transferId },
    include: { lines: { include: { rawMaterial: true } } },
  });
  if (!transfer) throw new Error("Transfer not found");
  if (transfer.receiverOutletId !== outlet.id) throw new Error("Only the receiving outlet can confirm");
  if (transfer.status !== "SENT") throw new Error(`Transfer already ${transfer.status.toLowerCase()}`);

  for (const l of data.lines) {
    const line = transfer.lines.find((tl) => tl.id === l.id);
    if (!line) continue;
    await db.transferLine.update({ where: { id: line.id }, data: { qtyReceived: l.qtyReceived } });
    // Increment receiver stock. Note: receiver outlet's RawMaterial must already exist
    // (or we'd need to create one). For prototype simplicity we increment by name match.
    const myRm = await db.rawMaterial.findFirst({
      where: { outletId: outlet.id, name: line.rawMaterial.name },
    });
    if (myRm) {
      await moveStock({
        rawMaterialId: myRm.id,
        delta: l.qtyReceived,
        reason: "TRANSFER_IN",
        refType: "Transfer",
        refId: transfer.id,
        note: `Received from outlet ${transfer.senderOutletId}`,
      });
    }
  }

  await db.transfer.update({
    where: { id: transfer.id },
    data: { status: "RECEIVED", receivedById: user?.id ?? null, receivedAt: new Date() },
  });
  await logActivity({
    action: "ACCEPT",
    entity: "Transfer",
    entityId: transfer.id,
    summary: `Received transfer from outlet ${transfer.senderOutletId}`,
    outletId: outlet.id,
  });
  revalidatePath("/inventory/transfers");
}
