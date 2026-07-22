"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/rbac";
import { getActiveOutlet } from "@/lib/outlet";
import { logActivity } from "@/lib/audit";
import { expireStaleCredits } from "@/lib/cve/wallet";

/** Admin-triggered sweep of expired wallet credits. Also runs via cron;
 * this button gives OWNERs a way to run it on demand if the cron is
 * delayed or when reconciling. Idempotent per credit id. */
export async function runExpirySweepAction(_fd?: FormData): Promise<void> {
  await requireUser("OWNER");
  const outlet = await getActiveOutlet();
  const r = await expireStaleCredits(new Date());
  await logActivity({
    action: "UPDATE",
    entity: "Customer",
    entityId: "wallet",
    summary: `Wallet expiry sweep: ${r.swept} credit${r.swept === 1 ? "" : "s"} expired · ₹${r.total.toFixed(2)}`,
    outletId: outlet.id,
  });
  revalidatePath("/admin/cve");
}
