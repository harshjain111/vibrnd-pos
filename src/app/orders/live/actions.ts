"use server";
/**
 * Floor-plan / receptionist actions.
 *
 * The "Assign table to customer" entry — first step in the role-aware POS
 * flow. A receptionist (or anyone with `pos.action.assign_table`) clicks an
 * empty table on the floor plan, fills name + phone + birthday + anniversary
 * + allergies, and we:
 *   1. Upsert the Customer row by phone (so repeat visitors land back on
 *      their profile, allergies persist).
 *   2. Create a RUNNING Order with the table + customer linked and no items
 *      yet. This is the "session" handle the captain picks up next.
 *   3. Audit-log so the receptionist's hand-off is visible.
 *
 * Stock + invoice numbers are deferred — they only matter once items land.
 * `invoiceNo` is allocated up front because the schema marks it @unique;
 * the rest of the totals stay at 0 until punch.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { nextInvoiceNo } from "@/lib/utils";
import { logActivity } from "@/lib/audit";
import { requireUser } from "@/lib/rbac";
import { canAccess, loadOutletPermissions } from "@/lib/permissions";

const AssignInput = z.object({
  tableId: z.string(),
  customerName: z.string().min(1, "Customer name is required"),
  customerPhone: z.string().min(1, "Phone is required"),
  customerBirthday: z.string().optional(),
  customerAnniversary: z.string().optional(),
  customerAllergies: z.string().optional(),
  /// Special Notes (Box 1 of the POS-module spec) — free-form remarks
  /// the receptionist captures at intake. Shown to captains on every
  /// future visit alongside allergies + birthday markers.
  customerSpecialNotes: z.string().optional(),
});

export type AssignTableResult =
  | { ok: true; orderId: string; invoiceNo: string; customerId: string }
  | { ok: false; error: string };

export async function assignTableToCustomer(
  input: z.infer<typeof AssignInput>
): Promise<AssignTableResult> {
  try {
    const user = await requireUser();
    const data = AssignInput.parse(input);
    const outlet = await getActiveOutlet();

    // Permission gate — RECEPTIONIST / BILLER / MANAGER / OWNER by default
    // (matrix in /src/lib/permissions.ts); owners can flip via Settings.
    const overrides = await loadOutletPermissions(outlet.id);
    if (!canAccess(user.role, "pos.action.assign_table", overrides)) {
      return { ok: false, error: "Your role can't assign tables" };
    }

    // Validate the table belongs to this outlet + isn't already running.
    // tableGroup is included so we can auto-attribute the captain when
    // the receptionist hands off — saves them from picking manually.
    const table = await db.diningTable.findFirst({
      where: { id: data.tableId, outletId: outlet.id, active: true },
      include: {
        orders: {
          where: { status: { in: ["RUNNING", "SAVED", "PRINTED"] } },
          select: { id: true, invoiceNo: true },
        },
        tableGroup: { select: { captainId: true, name: true } },
      },
    });
    if (!table) return { ok: false, error: "Table not found at this outlet" };
    if (table.orders.length > 0) {
      return {
        ok: false,
        error: `Table is already running — bill ${table.orders[0].invoiceNo}`,
      };
    }

    // Upsert customer by phone within outlet. Same `cust-${phone}` id
    // convention placeOrder uses so we don't fork the identity model.
    const birthday = data.customerBirthday ? new Date(data.customerBirthday) : undefined;
    const anniversary = data.customerAnniversary ? new Date(data.customerAnniversary) : undefined;
    const customer = await db.customer.upsert({
      where: { id: `cust-${data.customerPhone}` },
      update: {
        name: data.customerName,
        allergies: data.customerAllergies ?? undefined,
        specialNotes: data.customerSpecialNotes ?? undefined,
        birthday,
        anniversary,
      },
      create: {
        id: `cust-${data.customerPhone}`,
        name: data.customerName,
        phone: data.customerPhone,
        outletId: outlet.id,
        allergies: data.customerAllergies ?? undefined,
        specialNotes: data.customerSpecialNotes ?? undefined,
        birthday,
        anniversary,
      },
    });

    // Allocate invoiceNo. Retry on the rare clash (same outlet-scoped
    // sequence the placeOrder action uses).
    let invoiceNo = "";
    const count = await db.order.count({ where: { outletId: outlet.id } });
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = nextInvoiceNo(count + 1 + attempt, outlet.code);
      const clash = await db.order.findUnique({ where: { invoiceNo: candidate } });
      if (!clash) {
        invoiceNo = candidate;
        break;
      }
    }
    if (!invoiceNo) return { ok: false, error: "Could not allocate invoice number" };

    // Auto-attribute captain from the table-group (if the owner has set
    // one up at /settings/table-groups). Falls back to null so manager
    // can still pick later from the order detail page.
    const captainIdFromGroup = table.tableGroup?.captainId ?? null;

    const order = await db.order.create({
      data: {
        invoiceNo,
        orderType: "DINE_IN",
        status: "RUNNING",
        outletId: outlet.id,
        tableId: table.id,
        customerId: customer.id,
        captainId: captainIdFromGroup,
        subTotal: 0,
        taxTotal: 0,
        discount: 0,
        grandTotal: 0,
        amountPaid: 0,
        tip: 0,
      },
    });

    await logActivity({
      action: "CREATE",
      entity: "Order",
      entityId: order.id,
      summary: `Receptionist ${user.name} assigned ${customer.name} to ${table.name} (${invoiceNo})`,
      outletId: outlet.id,
    });

    revalidatePath("/orders/live");
    revalidatePath("/billing");
    return { ok: true, orderId: order.id, invoiceNo, customerId: customer.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
