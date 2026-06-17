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
import { postInternalTransferSend, postInternalTransferReceive, stockAtDepartment, moveStock } from "@/lib/stock";
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
  /** Optional cross-outlet target. When set, the requisition targets the
   *  STORE dept of THAT outlet (typically the active outlet's linked BS
   *  or BK). When null, the requisition is internal (within the current
   *  outlet, fromDept → own STORE). */
  toOutletId: z.string().optional(),
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

/** Validate that the active outlet is allowed to raise a cross-outlet
 *  requisition to `targetOutletId` — only its linked BS or BK qualifies. */
async function assertChainLink(activeOutlet: any, targetOutletId: string) {
  const linked =
    activeOutlet.baseStoreOutletId === targetOutletId ||
    activeOutlet.baseKitchenOutletId === targetOutletId;
  if (!linked) {
    throw new Error("Target outlet isn't your linked Base Store or Base Kitchen");
  }
}

export async function createRequisition(input: z.infer<typeof CreateInput>) {
  const user = await requireUser(); // any logged-in user; specific roles filtered by canAccess on the page
  const outlet = await getActiveOutlet();
  const data = CreateInput.parse(input);

  const isCrossOutlet = data.toOutletId && data.toOutletId !== outlet.id;

  // Resolve from-department. For cross-outlet requisitions the requester is
  // by convention the outlet's own STORE (the Store Manager is the one who
  // raises requests to chain locations).
  const hodKind = ownedDepartmentKind(user.role);
  const fromDepartmentId = isCrossOutlet
    ? (await getStoreDept(outlet.id)).id
    : await resolveFromDepartment(outlet.id, hodKind, data.fromDepartmentId);

  // Resolve to-department.
  let toDept;
  if (isCrossOutlet) {
    await assertChainLink(outlet as any, data.toOutletId!);
    toDept = await getStoreDept(data.toOutletId!);
  } else {
    toDept = await getStoreDept(outlet.id);
    if (fromDepartmentId === toDept.id) {
      throw new Error("Store cannot raise a requisition to itself");
    }
  }

  // Validate every raw material belongs to the REQUESTING outlet (you can
  // only ask for items already in your catalog).
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

  // Notify the recipient's Store Manager that there's a new requisition
  // waiting for review. For cross-outlet, the notification fires at the
  // SUPPLIER outlet (the BS / BK) so its SM sees the inbound queue light up.
  await db.notification.create({
    data: {
      outletId: isCrossOutlet ? data.toOutletId! : outlet.id,
      kind: "INFO",
      title: `New requisition · ${reqNo}`,
      body: isCrossOutlet
        ? `Inbound from ${outlet.name} — ${data.lines.length} item(s). Open to review.`
        : `${data.lines.length} item(s) requested by ${user.name}. Open to review.`,
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
export async function reviewRequisition(input: z.infer<typeof ReviewInput>): Promise<ActionResult> {
  try {
    return await reviewRequisitionInner(input);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function reviewRequisitionInner(input: z.infer<typeof ReviewInput>): Promise<ActionResult> {
  const user = await requireUser();
  const data = ReviewInput.parse(input);
  const outlet = await getActiveOutlet();

  // The reviewer is the SUPPLIER outlet's SM. For internal requisitions
  // that's the same outlet. For cross-outlet ones (Outlet → BS / BK) the
  // SM is at a different outlet from the requester — so we look up by
  // either `outletId = active outlet` (internal) OR
  // `toDepartment.outletId = active outlet` (chain supplier acting).
  const ownStoreDept = await db.department.findFirst({
    where: { outletId: outlet.id, kind: "STORE", active: true },
  });
  const req = await db.requisition.findFirst({
    where: {
      id: data.id,
      OR: [
        { outletId: outlet.id },
        ...(ownStoreDept ? [{ toDepartmentId: ownStoreDept.id }] : []),
      ],
    },
    include: { lines: true },
  });
  if (!req) throw new Error("Requisition not found at this outlet");
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
  return { ok: true };
}

/**
 * Fulfil an APPROVED or PARTIAL requisition by spawning a Transfer.
 *
 * Two modes:
 *   • INTERNAL (same outlet, dept → dept) — single-shot, status RECEIVED
 *     immediately. Ledger moves via postInternalTransferMovement (no change
 *     to RawMaterial.currentQty since stock didn't leave the outlet).
 *   • CHAIN (cross-outlet — sender's BS/BK → receiver outlet's STORE)
 *     — two-step. Transfer is created at SENT status, supplier stock is
 *     decremented now, receiver receives later via the standard
 *     /inventory/transfers receive workflow. This lets the receiver
 *     confirm what actually arrived vs what was shipped.
 *
 * Cross-outlet flow runs at the SUPPLIER outlet (the BS / BK) — that's
 * the active outlet for the user clicking "Transfer to requester".
 */
/** Returned by fulfilRequisition + reviewRequisition so the client toast can
 *  surface the real error message (Next.js production builds otherwise mask
 *  thrown errors as the cryptic "Server Components render" digest). */
export type ActionResult = { ok: true } | { ok: false; error: string };

export async function fulfilRequisition(fd: FormData): Promise<ActionResult> {
  try {
    return await fulfilRequisitionInner(fd);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function fulfilRequisitionInner(fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const id = String(fd.get("id") ?? "");
  if (!id) throw new Error("Requisition id is required");
  const outlet = await getActiveOutlet();

  // For cross-outlet, the requisition lives at the REQUESTING outlet, so
  // we need to look it up via the toDepartment's outlet (= active outlet
  // when the user is the supplier-side SM) OR via outletId (when same outlet).
  const supplierStoreDept = await db.department.findFirst({
    where: { outletId: outlet.id, kind: "STORE", active: true },
  });
  if (!supplierStoreDept) throw new Error("No STORE department for this outlet");

  const req = await db.requisition.findFirst({
    where: {
      id,
      OR: [
        { outletId: outlet.id }, // internal — req lives at active outlet
        { toDepartmentId: supplierStoreDept.id }, // cross-outlet — supplier acting
      ],
    },
    include: {
      lines: { include: { rawMaterial: true } },
      transfer: true,
      toDepartment: true,
      fromDepartment: true,
    },
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

  const isCrossOutlet = req.toDepartment.outletId !== req.fromDepartment.outletId;
  const supplierOutletId = req.toDepartment.outletId;
  const receiverOutletId = req.fromDepartment.outletId;

  // Validate the active user is at the supplier outlet.
  if (outlet.id !== supplierOutletId) {
    throw new Error("Switch to the supplier outlet before fulfilling this requisition");
  }

  if (!isCrossOutlet) {
    // ─── INTERNAL flow — dispatch (partial by availability) ─────────────
    // The store dispatches as much as it currently holds. Any shortfall is
    // covered by a PO (manual, linked back to the requisition) — we never
    // throw on insufficient stock. The transfer goes out at SENT; the
    // requesting department confirms receipt with a GRN on its dept page,
    // which is when *their* stock rises.
    //
    // Stock-at-dept lookups run in parallel — each fans into 3-4 Prisma
    // queries and the sequential version made the dialog feel hung on
    // multi-line reqs (especially on Vercel's serverless 10s budget).
    const onHandPairs = await Promise.all(
      linesToMove.map(async (l) => ({
        line: l,
        onHand: await stockAtDepartment(l.rawMaterialId, req.toDepartmentId),
      }))
    );
    const dispatch = onHandPairs
      .map(({ line, onHand }) => ({
        line,
        qtyToSend: Math.max(0, Math.min(line.qtyApproved, Number(onHand.toFixed(4)))),
      }))
      .filter((d) => d.qtyToSend > 0);

    if (dispatch.length === 0) {
      throw new Error(
        "Nothing to transfer — the store is out of stock for every approved line. Raise a PO to restock first."
      );
    }

    const challanNo = `${req.reqNo}-T`;
    await db.$transaction(async (tx) => {
      await tx.transfer.create({
        data: {
          challanNo,
          transferDate: new Date(),
          status: "SENT",
          senderOutletId: outlet.id,
          receiverOutletId: outlet.id,
          fromDepartmentId: req.toDepartmentId,
          toDepartmentId: req.fromDepartmentId,
          kind: "INTERNAL",
          requisitionId: req.id,
          sentById: user.id,
          notes: `Dispatch of ${req.reqNo} — awaiting GRN at requesting department`,
          lines: {
            create: dispatch.map((d) => ({
              rawMaterialId: d.line.rawMaterialId,
              qtySent: d.qtyToSend,
              qtyReceived: 0,
              unit: d.line.unit,
              priceAtTransfer: 0,
            })),
          },
        },
      });
      await tx.requisition.update({ where: { id: req.id }, data: { status: "FULFILLED" } });
    });
    // Per-line dispatch ledger writes (−store) — fan out.
    await Promise.all(
      dispatch.map((d) =>
        postInternalTransferSend({
          rawMaterialId: d.line.rawMaterialId,
          qty: d.qtyToSend,
          fromDepartmentId: req.toDepartmentId,
          refType: "Requisition",
          refId: req.id,
          note: `${req.reqNo} dispatch`,
        })
      )
    );
  } else {
    // ─── CHAIN flow (cross-outlet, new in Prompt 4.2) ───────────────────
    // The requisition lines reference the REQUESTER's RawMaterial ids. We
    // need to find the matching RMs at the supplier outlet (the active one)
    // by name + decrement stock there.
    const lineNames = linesToMove.map((l) => l.rawMaterial.name);
    const supplierRms = await db.rawMaterial.findMany({
      where: { outletId: outlet.id, name: { in: lineNames } },
    });
    const supplierRmByName = new Map(supplierRms.map((r) => [r.name, r]));

    // Validate supplier has stock for every line.
    for (const l of linesToMove) {
      const srm = supplierRmByName.get(l.rawMaterial.name);
      if (!srm) {
        throw new Error(`${l.rawMaterial.name} doesn't exist at the supplier outlet — catalog mismatch`);
      }
      if (srm.currentQty < l.qtyApproved) {
        throw new Error(
          `Insufficient stock of ${l.rawMaterial.name} at this BS/BK (have ${srm.currentQty}, need ${l.qtyApproved})`
        );
      }
    }

    // BK markup — when the supplier outlet is a BASE_KITCHEN and the
    // applyBKMarkupOnTransfer toggle is on, bake the % markup into the
    // priceAtTransfer that gets carried to the receiver's avg-cost roll.
    const supplierKind = (outlet as any).kind ?? "OUTLET";
    const applyMarkup =
      supplierKind === "BASE_KITCHEN" && (outlet as any).applyBKMarkupOnTransfer === true;
    const markupPct = applyMarkup ? Number((outlet as any).bkMarkupPercent ?? 0) : 0;
    const markupFactor = 1 + markupPct / 100;

    const challanNo = `${req.reqNo}-C`;
    await db.$transaction(async (tx) => {
      await tx.transfer.create({
        data: {
          challanNo,
          transferDate: new Date(),
          status: "SENT", // CHAIN — receiver confirms separately
          senderOutletId: supplierOutletId,
          receiverOutletId: receiverOutletId,
          fromDepartmentId: req.toDepartmentId,
          toDepartmentId: req.fromDepartmentId,
          kind: "CHAIN",
          requisitionId: req.id,
          sentById: user.id,
          notes: applyMarkup
            ? `Chain fulfilment of ${req.reqNo} (BK markup ${markupPct}% applied)`
            : `Chain fulfilment of ${req.reqNo}`,
          lines: {
            create: linesToMove.map((l) => {
              const srm = supplierRmByName.get(l.rawMaterial.name)!;
              const baseCost = srm.avgCost ?? 0;
              return {
                rawMaterialId: srm.id, // supplier's RM id on the transfer line
                qtySent: l.qtyApproved,
                qtyReceived: 0,
                unit: l.unit,
                priceAtTransfer: baseCost * markupFactor,
              };
            }),
          },
        },
      });
      await tx.requisition.update({ where: { id: req.id }, data: { status: "FULFILLED" } });
    });

    // Decrement supplier stock now (TRANSFER_OUT). Receiver TRANSFER_IN
    // happens via the standard receiveTransfer action.
    for (const l of linesToMove) {
      const srm = supplierRmByName.get(l.rawMaterial.name)!;
      await moveStock({
        rawMaterialId: srm.id,
        delta: -l.qtyApproved,
        reason: "CHAIN_TRANSFER",
        refType: "Requisition",
        refId: req.id,
        departmentId: supplierStoreDept.id,
        note: `${req.reqNo} → outlet ${receiverOutletId}`,
      });
    }
  }

  await logActivity({
    action: "UPDATE",
    entity: "RawMaterial",
    entityId: req.id,
    summary: `Requisition ${req.reqNo} ${
      isCrossOutlet ? "shipped (chain)" : "dispatched"
    } — ${linesToMove.length} item(s)`,
    outletId: outlet.id,
  });

  if (req.requestedById) {
    await db.notification.create({
      data: {
        outletId: receiverOutletId,
        kind: "INFO",
        title: `Requisition ${req.reqNo} ${isCrossOutlet ? "shipped" : "dispatched"}`,
        body: isCrossOutlet
          ? `${linesToMove.length} item(s) en route. Confirm receipt at /inventory/transfers.`
          : `Stock dispatched from store. Receive it via "Raise GRN" on your department page.`,
        link: `/inventory/requisitions/${req.id}`,
      },
    });
  }

  revalidatePath("/inventory/requisitions");
  revalidatePath(`/inventory/requisitions/${req.id}`);
  revalidatePath("/inventory/transfers");
  // HOD dashboard surfaces approved reqs in an "Ready for collection"
  // banner — refresh so the banner drops as soon as fulfilment lands.
  revalidatePath("/inventory/dashboard");
  return { ok: true };
}

/**
 * Department-side receipt of a SENT internal transfer ("Raise GRN" on the
 * department page). This is the second half of the two-step internal move:
 * the store already dropped its stock on dispatch; here the receiving
 * department's stock rises (one +qty ledger row per line) and the transfer
 * flips to RECEIVED.
 */
export async function receiveInternalTransfer(fd: FormData): Promise<ActionResult> {
  try {
    return await receiveInternalTransferInner(fd);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function receiveInternalTransferInner(fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const transferId = String(fd.get("transferId") ?? "");
  if (!transferId) throw new Error("Transfer id is required");
  const outlet = await getActiveOutlet();

  const transfer = await db.transfer.findUnique({
    where: { id: transferId },
    include: { lines: { include: { rawMaterial: true } }, toDepartment: true },
  });
  if (!transfer) throw new Error("Transfer not found");
  if (transfer.kind !== "INTERNAL") {
    throw new Error("Use the Transfers tab to receive cross-outlet (chain) transfers");
  }
  if (transfer.status !== "SENT") {
    throw new Error(`Transfer already ${transfer.status.toLowerCase()}`);
  }
  if (transfer.receiverOutletId !== outlet.id) {
    throw new Error("Switch to the receiving outlet before raising this GRN");
  }
  if (!transfer.toDepartmentId) throw new Error("Transfer has no destination department");

  await db.$transaction(async (tx) => {
    for (const l of transfer.lines) {
      await tx.transferLine.update({ where: { id: l.id }, data: { qtyReceived: l.qtySent } });
    }
    await tx.transfer.update({
      where: { id: transfer.id },
      data: { status: "RECEIVED", receivedById: user.id, receivedAt: new Date() },
    });
  });

  // +dept ledger writes — fan out.
  await Promise.all(
    transfer.lines
      .filter((l) => l.qtySent > 0)
      .map((l) =>
        postInternalTransferReceive({
          rawMaterialId: l.rawMaterialId,
          qty: l.qtySent,
          toDepartmentId: transfer.toDepartmentId!,
          refType: "Transfer",
          refId: transfer.id,
          note: `${transfer.challanNo ?? transfer.id} GRN`,
        })
      )
  );

  await logActivity({
    action: "ACCEPT",
    entity: "Transfer",
    entityId: transfer.id,
    summary: `Transfer ${transfer.challanNo ?? transfer.id} received into ${transfer.toDepartment?.name ?? "department"} — ${transfer.lines.length} item(s)`,
    outletId: outlet.id,
  });

  revalidatePath("/inventory/transfers");
  revalidatePath("/inventory/dashboard");
  revalidatePath("/inventory/available");
  if (transfer.toDepartmentId) revalidatePath(`/inventory/departments/${transfer.toDepartmentId}`);
  return { ok: true };
}
