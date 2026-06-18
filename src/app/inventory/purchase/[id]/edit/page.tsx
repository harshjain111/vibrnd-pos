import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * /inventory/purchase/[id]/edit was a separate single-PO editor used by
 * the legacy single-supplier flow. The new "New PO" page is a cart-style
 * picker that splits into N POs on submit — there's no inverse "merge
 * back into one editable form" operation that makes sense, so a DRAFT
 * revision is just "cancel + create new" now.
 *
 * Rather than ripping the entry point out and leaving 404s for anyone
 * with the URL bookmarked, this page redirects DRAFT POs to the detail
 * view (where Cancel + the cart-style New PO live one click away) and
 * tells anyone else why edits aren't possible in their current state.
 */
export default async function EditPOPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const outlet = await getActiveOutlet();

  const po = await db.purchaseOrder.findFirst({
    where: { id, outletId: outlet.id },
    select: { id: true, poNo: true, status: true },
  });
  if (!po) return notFound();

  // For DRAFT POs the actionable next step (cancel + re-create) lives on
  // the detail page, so just send the SM there with a banner-style
  // note. The detail page already has Cancel + a "Create another PO"
  // link in its action row.
  if (po.status === "DRAFT") {
    redirect(`/inventory/purchase/${po.id}?revise=1`);
  }

  return (
    <div>
      <PageHeader
        title={`Cannot edit ${po.poNo}`}
        description={`PO is currently ${po.status} — only DRAFT purchase orders are revisable, and revisions now happen as cancel + new.`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href={`/inventory/purchase/${po.id}`}>
              <ArrowLeft className="h-4 w-4" />
              Back to PO
            </Link>
          </Button>
        }
      />
      <Card className="border-amber-300 bg-amber-50/40">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-900">
            POs in this status can't be edited in place. If the supplier
            rejected the order or you need different items, cancel this PO
            from the detail page and raise a fresh one with the corrected
            lines.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
