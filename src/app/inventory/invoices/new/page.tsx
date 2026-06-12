import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { NewInvoiceForm } from "./client";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ grn?: string; supplier?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const outlet = await getActiveOutlet();

  // Seed from a single GRN (the common case from the GRN detail "Record invoice" link)
  const seedGrn = sp.grn
    ? await db.grn.findFirst({
        where: { id: sp.grn, outletId: outlet.id },
        include: {
          lines: true,
          po: { include: { supplier: true } },
        },
      })
    : null;

  let supplierId = sp.supplier ?? seedGrn?.po?.supplierId ?? "";

  // For the supplier picker on ad-hoc invoices we need the supplier list.
  const suppliers = await db.supplier.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Eligible GRNs to attach: same supplier (via linked PO) OR ad-hoc with no PO
  const eligibleGrns = await db.grn.findMany({
    where: {
      outletId: outlet.id,
      OR: [{ poId: null }, { po: supplierId ? { supplierId } : undefined }],
    },
    include: { po: { select: { poNo: true, supplierId: true } }, lines: true },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });

  const seedTotal = seedGrn ? seedGrn.lines.reduce((s, l) => s + l.qtyReceived * l.unitCost, 0) : 0;

  return (
    <div>
      <PageHeader
        title="Record vendor invoice"
        description={seedGrn ? `Against GRN ${seedGrn.grnNo}` : "Choose which GRNs this invoice covers"}
      />
      <Card className="mb-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">How invoices work</CardTitle>
          <CardDescription>
            One vendor invoice can cover one or more GRNs (vendor batches deliveries into one bill).
            Set the totals from the printed invoice. Payment is recorded after the invoice is saved.
          </CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardContent className="p-4">
          <NewInvoiceForm
            suppliers={suppliers}
            initialSupplierId={supplierId}
            initialGrnId={seedGrn?.id ?? null}
            seedTotal={Math.round(seedTotal)}
            eligibleGrns={eligibleGrns.map((g) => ({
              id: g.id,
              grnNo: g.grnNo,
              poNo: g.po?.poNo ?? null,
              supplierId: g.po?.supplierId ?? null,
              receivedAt: g.receivedAt.toISOString(),
              value: Math.round(g.lines.reduce((s, l) => s + l.qtyReceived * l.unitCost, 0)),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
