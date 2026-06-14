import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { BillingScreen } from "./billing-screen";
import { PageHeader } from "@/components/shell/page-header";
import { getSessionUser } from "@/lib/session";
import { resumeHeldBill } from "./actions";
import { canAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ resume?: string }>;
}) {
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const isCaptain = user?.role === "CAPTAIN";
  // Per the POS access matrix (image spec): only MANAGER/OWNER apply
  // discounts; only BILLER/MANAGER/OWNER settle bills. Capture once so the
  // BillingScreen hides controls the role can't use.
  const role = user?.role ?? "";
  const canApplyDiscount = canAccess(role, "pos.action.discount");
  const canSettleBill = canAccess(role, "pos.action.settle_bill");
  const sp = await searchParams;
  // Optional: resume a held bill so the cart, customer, table all rehydrate.
  let resumed = null as Awaited<ReturnType<typeof resumeHeldBill>> | null;
  if (sp.resume) {
    try {
      resumed = await resumeHeldBill(sp.resume);
    } catch {
      // Bill not found / already settled / different outlet — fall through to fresh start.
    }
  }
  const [categories, items, tables, subTypes, captains] = await Promise.all([
    db.category.findMany({ where: { outletId: outlet.id }, orderBy: { rank: "asc" } }),
    db.item.findMany({
      where: { outletId: outlet.id, active: true, outOfStock: false },
      include: {
        variants: { orderBy: { rank: "asc" } },
        addons: { orderBy: { rank: "asc" } },
        tagAssigns: { include: { tag: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.diningTable.findMany({ where: { outletId: outlet.id }, orderBy: { name: "asc" } }),
    db.subOrderType.findMany({
      where: { outletId: outlet.id, active: true },
      orderBy: [{ parentType: "asc" }, { rank: "asc" }],
    }),
    db.user.findMany({
      where: { outletId: outlet.id, active: true, role: { in: ["CAPTAIN", "BILLER"] } },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title={resumed ? `Continue ${resumed.invoiceNo}` : "New bill"}
        description={
          resumed
            ? `Resuming a held bill — add more items or settle when ready`
            : outlet.taxInclusive
              ? "Prices include GST · build an order and settle payment"
              : "Build an order and settle payment"
        }
      />
      <BillingScreen
        captainMode={isCaptain}
        canApplyDiscount={canApplyDiscount}
        canSettleBill={canSettleBill}
        kdsEnabled={(outlet as any).kdsEnabled ?? true}
        serviceChargePct={(outlet as any).serviceChargePct ?? 10}
        resumed={resumed}
        upiVpa={(outlet as any).upiVpa ?? null}
        outletName={outlet.name}
        taxInclusive={outlet.taxInclusive}
        loyaltyEarnPer={outlet.loyaltyEarnPer}
        loyaltyRedeemRupees={outlet.loyaltyRedeemRupees}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          price: i.price,
          taxRate: i.taxRate,
          categoryId: i.categoryId,
          isVeg: i.isVeg,
          imageUrl: i.imageUrl,
          description: i.description,
          dietary: (i as any).dietary,
          variants: i.variants.map((v) => ({ id: v.id, name: v.name, price: v.price })),
          addons: i.addons.map((a) => ({ id: a.id, name: a.name, priceDelta: a.priceDelta })),
          tags: i.tagAssigns.map((ta) => ({
            id: ta.tag.id,
            name: ta.tag.name,
            icon: ta.tag.icon,
            color: ta.tag.color,
          })),
        }))}
        tables={tables.map((t) => ({ id: t.id, name: t.name }))}
        subTypes={subTypes.map((s) => ({ name: s.name, parentType: s.parentType }))}
        captains={captains.map((u) => ({ id: u.id, name: u.name, role: u.role }))}
      />
    </div>
  );
}
