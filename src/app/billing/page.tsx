import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { BillingScreen } from "./billing-screen";
import { PageHeader } from "@/components/shell/page-header";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const outlet = await getActiveOutlet();
  const user = await getSessionUser();
  const isCaptain = user?.role === "CAPTAIN";
  const [categories, items, tables, subTypes, captains] = await Promise.all([
    db.category.findMany({ where: { outletId: outlet.id }, orderBy: { rank: "asc" } }),
    db.item.findMany({
      where: { outletId: outlet.id, active: true, outOfStock: false },
      include: { variants: { orderBy: { rank: "asc" } }, addons: { orderBy: { rank: "asc" } } },
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
        title="New bill"
        description={
          outlet.taxInclusive
            ? "Prices include GST · build an order and settle payment"
            : "Build an order and settle payment"
        }
      />
      <BillingScreen
        captainMode={isCaptain}
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
          dietary: (i as any).dietary,
          variants: i.variants.map((v) => ({ id: v.id, name: v.name, price: v.price })),
          addons: i.addons.map((a) => ({ id: a.id, name: a.name, priceDelta: a.priceDelta })),
        }))}
        tables={tables.map((t) => ({ id: t.id, name: t.name }))}
        subTypes={subTypes.map((s) => ({ name: s.name, parentType: s.parentType }))}
        captains={captains.map((u) => ({ id: u.id, name: u.name, role: u.role }))}
      />
    </div>
  );
}
