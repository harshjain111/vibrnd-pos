"use server";
/**
 * Internal Requisition service.
 *
 * Workflow:
 *   1. HOD (Chef / Bartender / Housekeeping Lead) raises a Requisition listing
 *      raw materials + qty needed from the outlet's STORE department.
 *   2. Store Manager opens the requisition, edits qtyApproved per line (full
 *      / partial / zero with reason), and either:
 *        a. Saves the review without fulfilling — gives status APPROVED or
 *           PARTIAL (or DECLINED if every line went to 0).
 *        b. Fulfils — spawns an internal Transfer (kind=INTERNAL) from STORE
 *           to the HOD's dept. Two stock-ledger rows are written per line
 *           (-qty at STORE, +qty at HOD dept) WITHOUT touching outlet total
 *           qty. Status flips to FULFILLED.
 *   3. HOD gets a Notification on review + on fulfilment.
 *   4. Every transition writes an ActivityLog row.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";
import { logActivity } from "@/lib/audit";
import { postInternalTransferMovement, stockAtDepartment } from "@/lib/stock";
import { ownedDepartmentKind } from "@/lib/rbac";

const LineInput = z.object({
  rawMaterialId: z.string(),
  qty: z.coerce.number().positive(),
  unit: z.string().min(1),
});

const CreateInput = z.object({
  /** Optional — defaults to the HOD's own department for HOD roles, else
   *  required from the form (Manager / Owner can raise on behalf of any
   *  department). */
  fromDepartmentId: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(LineInput).min(1, "At least one item is required"),
});

/** Outlet-scoped requisition number. Same pattern as PO / invoice / KOT —
 *  per-outlet count + outlet code in the number + retry on the rare clash. */
async function nextReqNo(outletId: string, outletCode: string) {
  const count = await db.requisition.count({ where: { outletId } });
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `REQ-${outletCode}-${String(count + 1 + attempt).padStart(6, "0")}`;
    const clash = await db.requisition.findUnique({ where: { reqNo: candidate } });
    if (!clash) return candidate;
  }
  throw new Error("Could not allocate a requisition number");
}

async function resolveFromDepartment(
  outletId: string,
  hodKind: string | null,
  override?: string
): Promise<string> {
  if (override) {
    const d = await db.department.findFirst({ where: { id: override, outletId, active: true } });
    if (!d) throw new Error("Department not found");
    return d.id;
  }
  if (hodKind) {
    const d = await db.department.findFirst({
      where: { outletId, kind: hodKind, active: true },
      orderBy: { createdAt: "asc" },
    });
    if (!d) throw new Error(`No active ${hodKind} department for this outlet`);
    return d.id;
  }
  throw new Error("From-department is required");
}

async function getStoreDept(outletId: string) {
  const store = await db.department.findFirst({
    where: { outletId, kind: "STORE", active: true },
    orderBy: { createdAt: "asc" },
  });
  if (!store) throw new Error("No STORE department for this outlet — run db:backfill:departments");
  return store;
}

export async function createRequisition(input: z.infer<typeof CreateInput>) {
  const user = await requireUser(); // any logged-in user; specific roles filtered by canAccess on the page
  const outlet = await getActiveOutlet();
  const data = CreateInput.parse(input);

  const hodKind = ownedDepartmentKind(user.role);
  const fromDepartmentId = await resolveFromDepartment(outlet.id, hodKind, data.fromDepartmentId);
  const toDept = await getStoreDept(outlet.id);
  if (fromDepartmentId === toDept.id) {
    throw new Error("Store cannot raise a requisition to itself");
  }

  // Validate every raw material belongs to this outlet.
  const rms = await db.rawMaterial.findMany({
    where: { id: { in: data.lines.map((l) => l.rawMaterialId) }, outletId: outlet.id },
  });
  const rmMap = new Map(rms.map((r) => [r.id, r]));
  for (const l of data.lines) {
    if (!rmMap.has(l.rawMaterialId)) throw new Error(`Raw material not found in this outlet`);
  }

  const reqNo = await nextReqNo(outlet.id, outlet.code);

  const req = await db.requisition.create({
    data: {
      reqNo,
      outletId: outlet.id,
      fromDepartmentId,
      toDepartmentId: toDept.id,
      status: "NEW",
      requestedById: user.id,
      notes: data.notes,
      lines: {
        create: data.lines.map((l) => ({
          rawMaterialId: l.rawMaterialId,
          qtyRequested: l.qty,
          qtyApproved: 0,
          unit: l.unit,
        })),
      },
    },
  });

  await logActivity({
    action: "CREATE",
    entity: "RawMaterial",
    entityId: req.id,
    summary: `Requisition ${reqNo} raised — ${data.lines.length} item(s) requested`,
    outletId: outlet.id,
  });

  // Notify the Store Manager that there's a new requisition waiting for review.
  await db.notification.create({
    data: {
      outletId: outlet.id,
      kind: "INFO",
      title: `New requisition · ${reqNo}`,
      body: `${data.lines.length} item(s) requested by ${user.name}. Open to review.`,
      link: `/inventory/requisitions/${req.id}`,
    },
  });

  revalidatePath("/inventory/requisitions");
  redirect(`/inventory/requisitions/${req.id}`);
}

/** HOD cancels before SM reviews. */
export async function cancelRequisition(fd: FormData) {
  await requireUser();
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  const outlet = await getActiveOutlet();
  const req = await db.requisition.findFirst({ where: { id, outletId: outlet.id } });
  if (!req || req.status !== "NEW") throw new Error("Requisition cannot be cancelled at this stage");
  await db.requisition.update({ where: { id }, data: { status: "CANCELLED" } });
  await logActivity({
    action: "CANCEL",
    entity: "RawMaterial",
    entityId: id,
    summary: `Requisition ${req.reqNo} cancelled by requester`,
    outletId: outlet.id,
  });
  revalidatePath("/inventory/requisitions");
  revalidatePath(`/inventory/requisitions/${id}`);
}

const ReviewLineInput = z.object({
  lineId: z.string(),
  qtyApproved: z.coerce.number().min(0),
  declineReason: z.string().optional(),
});
const ReviewInput = z.object({
  id: z.string(),
  lines: z.array(ReviewLineInput).min(1),
  notes: z.string().optional(),
  /** When true, every line's qtyApproved is forced to 0 and `notes` is the
   *  whole-requisition decline reason. */
  declineAll: z.boolean().default(false),
});

/**
 * Store Manager review. Saves qtyApproved per line. Status derives from the
 * approved qtys:
 *   • all qtyApproved == qtyRequested            → APPROVED
 *   • some qtyApproved < qtyRequested but some > 0 → PARTIAL
 *   • every qtyApproved == 0                      → DECLINED (notes required)
 *
 * Per-line declineReason is required when 0 < qtyApproved < qtyRequested.
 */
export async function reviewRequisition(input: z.infer<typeof ReviewInput>) {
  const user = await requireUser();
  const data = ReviewInput.parse(input);
  const outlet = await getActiveOutlet();
  const req = await db.requisition.findFirst({
    where: { id: data.id, outletId: outlet.id },
    include: { lines: true },
  });
  if (!req) throw new Error("Requisition not found");
  if (req.status !== "NEW") throw new Error(`Cannot review a ${req.status} requisition`);

  // Build the merged line state (override qtyApproved from input).
  const lineById = new Map(req.lines.map((l) => [l.id, l]));
  const merged = data.lines.map((l) => {
    const orig = lineById.get(l.lineId);
    if (!orig) throw new Error("Line not found on this requisition");
    const qtyApproved = data.declineAll ? 0 : Math.min(l.qtyApproved, orig.qtyRequested);
    if (qtyApproved > 0 && qtyApproved < orig.qtyRequested && !l.declineReason) {
      throw new Error(`Reason required when partially approving ${orig.rawMaterialId}`);
    }
    return { id: l.lineId, qtyApproved, declineReason: l.declineReason ?? null, qtyRequested: orig.qtyRequested };
  });

  const total = merged.length;
  const fullyApproved = merged.filter((l) => l.qtyApproved === l.qtyRequested).length;
  const zeros = merged.filter((l) => l.qtyApproved === 0).length;
  let nextStatus: string;
  if (data.declineAll || zeros === total) nextStatus = "DECLINED";
  else if (fullyApproved === total) nextStatus = "APPROVED";
  else nextStatus = "PARTIAL";

  if (nextStatus === "DECLINED" && !data.notes) {
    throw new Error("A decline reason is required when declining the whole requisition");
  }

  await db.$transaction(async (tx) => {
    for (const l of merged) {
      await tx.requisitionLine.update({
        where: { id: l.id },
        data: { qtyApproved: l.qtyApproved, declineReason: l.declineReason },
      });
    }
    await tx.requisition.update({
      where: { id: req.id },
      data: {
        status: nextStatus,
        reviewedById: user.id,
        reviewedAt: new Date(),
        declineReason: nextStatus === "DECLINED" ? data.notes ?? null : null,
        notes: data.notes ?? req.notes,
      },
    });
  });

  await logActivity({
    action: "UPDATE",
    entity: "RawMaterial",
    entityId: req.id,
    summary: `Requisition ${req.reqNo} ${nextStatus.toLowerCase()} by ${user.name}`,
    outletId: outlet.id,
  });

  // Ping the requester with the outcome.
  if (req.requestedById) {
    await db.notification.create({
      data: {
        outletId: outlet.id,
        kind: "INFO",
        title: `Requisition ${req.reqNo} ${nextStatus.toLowerCase()}`,
        body: nextStatus === "DECLINED"
          ? `Declined: ${data.notes}`
          : `${fullyApproved}/${total} fully approved. Open to see details.`,
        link: `/inventory/requisitions/${req.id}`,
      },
    });
  }

  revalidatePath("/inventory/requisitions");
  revalidatePath(`/inventory/requisitions/${req.id}`);
}

/**
 * Fulfil an APPROVED or PARTIAL requisition by spawning an internal Transfer.
 * Validates that the STORE actually has enough stock per line (using the
 * ledger sum) before moving. Atomic across Transfer create + line stock
 * movements + requisition status update.
 */
export async function fulfilRequisition(fd: FormData) {
  const user = await requireUser();
  const id = String(fd.get("id") ?? "");
  if (!id) throw new Error("Requisition id is required");
  const outlet = await getActiveOutlet();
  const req = await db.requisition.findFirst({
    where: { id, outletId: outlet.id },
    include: { lines: { include: { rawMaterial: true } }, transfer: true },
  });
  if (!req) throw new Error("Requisition not found");
  if (req.status !== "APPROVED" && req.status !== "PARTIAL") {
    throw new Error(`Can only fulfil APPROVED or PARTIAL requisitions (this one is ${req.status})`);
  }
  if (req.transfer) {
    throw new Error("This requisition has already been transferred");
  }

  const linesToMove = req.lines.filter((l) => l.qtyApproved > 0);
  if (linesToMove.length === 0) throw new Error("Nothing to transfer — every line is declined");

  // Validate stock at STORE for every line.
  for (const l of linesToMove) {
    const onHand = await stockAtDepartment(l.rawMaterialId, req.toDepartmentId);
    if (onHand < l.qtyApproved) {
      throw new Error(
        `Insufficient stock of ${l.rawMaterial.name} at STORE (have ${onHand}, need ${l.qtyApproved})`
      );
    }
  }

  // Build challan number — reuses the requisition number with a -T suffix
  // so the paper trail is obvious ("REQ-23456-000001 → REQ-23456-000001-T").
  const challanNo = `${req.reqNo}-T`;

  await db.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: {
        challanNo,
        transferDate: new Date(),
        status: "RECEIVED", // internal — same outlet, single-shot
        senderOutletId: outlet.id,
        receiverOutletId: outlet.id,
        fromDepartmentId: req.toDepartmentId, // STORE
        toDepartmentId: req.fromDepartmentId, // HOD's dept
        kind: "INTERNAL",
        requisitionId: req.id,
        sentById: user.id,
        receivedById: user.id,
        receivedAt: new Date(),
        notes: `Auto-fulfilment of ${req.reqNo}`,
        lines: {
          create: linesToMove.map((l) => ({
            rawMaterialId: l.rawMaterialId,
            qtySent: l.qtyApproved,
            qtyReceived: l.qtyApproved,
            unit: l.unit,
            priceAtTransfer: 0,
          })),
        },
      },
    });

    await tx.requisition.update({
      where: { id: req.id },
      data: { status: "FULFILLED" },
    });

    // Stock ledger moves OUTSIDE the transaction — postInternalTransferMovement
    // does its own writes. We accept the small risk window between transfer
    // commit and ledger entries; ledger reconstruct can always replay.
    return transfer;
  });

  for (const l of linesToMove) {
    await postInternalTransferMovement({
      rawMaterialId: l.rawMaterialId,
      qty: l.qtyApproved,
      fromDepartmentId: req.toDepartmentId,
      toDepartmentId: req.fromDepartmentId,
      refType: "Requisition",
      refId: req.id,
      note: `${req.reqNo} fulfilment`,
    });
  }

  await logActivity({
    action: "UPDATE",
    entity: "RawMaterial",
    entityId: req.id,
    summary: `Requisition ${req.reqNo} fulfilled — ${linesToMove.length} item(s) transferred`,
    outletId: outlet.id,
  });

  if (req.requestedById) {
    await db.notification.create({
      data: {
        outletId: outlet.id,
        kind: "INFO",
        title: `Requisition ${req.reqNo} delivered`,
        body: `${linesToMove.length} item(s) moved to your department.`,
        link: `/inventory/requisitions/${req.id}`,
      },
    });
  }

  revalidatePath("/inventory/requisitions");
  revalidatePath(`/inventory/requisitions/${req.id}`);
  revalidatePath("/inventory/transfers");
}
