import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import { DiscountDialog, DiscountTypeBadge, type DiscountInit } from "./client";
import { deleteDiscount } from "./actions";

export const dynamic = "force-dynamic";

const CHANNEL_LABEL: Record<string, string> = {
  POS: "POS",
  ONLINE_PLATFORM: "Online",
  ZOMATO: "Zomato",
  SWIGGY: "Swiggy",
  KIOSK: "Kiosk",
  GPAY: "GPay",
  OS_AGGREGATOR: "OS",
  MR_DIVERT: "Mr Divert",
  IRCTC: "IRCTC",
};

const MODE_LABEL: Record<string, string> = {
  NONE: "Automatic",
  CODE_ONLY: "Code",
  COUPON_VALIDATED: "Coupon",
};

function fmtValue(d: { type: string; value: number; maxDiscount: number | null }) {
  switch (d.type) {
    case "PERCENT":
    case "PERCENTAGE":
      return `${d.value}%${d.maxDiscount ? ` · cap ${inr(d.maxDiscount)}` : ""}`;
    case "FLAT":
    case "FIXED":
      return inr(d.value);
    case "FIXED_PRICE":
      return `₹${d.value} flat`;
    case "BOGO":
      return "BOGO";
    default:
      return "—";
  }
}

export default async function DiscountsPage() {
  const outlet = await getActiveOutlet();

  // Pull everything we need to render the list AND populate the editor's
  // category / item pickers — single trip so the dialog doesn't flicker
  // while it fetches scope options on first open.
  const [discounts, categories, items] = await Promise.all([
    db.discount.findMany({
      where: { outletId: outlet.id },
      include: { bogo: true },
      orderBy: { createdAt: "desc" },
    }),
    db.category.findMany({
      where: { outletId: outlet.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.item.findMany({
      where: { outletId: outlet.id, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const toInit = (d: (typeof discounts)[number]): DiscountInit => ({
    id: d.id,
    title: d.name,
    code: d.code,
    type: d.type as any,
    channel: d.channel,
    orderTypes: d.orderTypes,
    value: d.value,
    minOrder: d.minOrder,
    maxOrder: d.maxOrder,
    maxDiscount: d.maxDiscount,
    applyOn: d.applyOn,
    paymentMethods: d.paymentMethods,
    applyAt: d.applyAt,
    applicableScope: d.applicableScope,
    applicableIds: d.applicableIds,
    validationMode: d.validationMode,
    active: d.active,
    validFrom: d.validFrom?.toISOString(),
    validTo: d.validTo?.toISOString(),
    timeFrom: d.timeFrom,
    timeTo: d.timeTo,
    daysOfWeek: d.daysOfWeek,
    description: d.description,
    terms: d.terms,
    bogo: d.bogo
      ? {
          itemAmountMin: d.bogo.itemAmountMin,
          buyScope: d.bogo.buyScope,
          buyScopeIds: d.bogo.buyScopeIds,
          getScope: d.bogo.getScope,
          getScopeIds: d.bogo.getScopeIds,
          buyQty: d.bogo.buyQty,
          getQty: d.bogo.getQty,
          bogoValueType: d.bogo.bogoValueType,
          bogoValue: d.bogo.bogoValue,
          getItemPricing: d.bogo.getItemPricing,
          buyItemPricing: d.bogo.buyItemPricing,
          showFreeQtyOnPos: d.bogo.showFreeQtyOnPos,
          buyAmountCap: d.bogo.buyAmountCap,
        }
      : null,
  });

  return (
    <div>
      <PageHeader
        title="Discounts & coupons"
        description={`${discounts.length} configured · supports Percentage, Fixed, BOGO and Fixed-Price discounts across all sales channels`}
        actions={
          <DiscountDialog categories={categories} items={items}>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add discount
            </Button>
          </DiscountDialog>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Validation</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Min order</TableHead>
                <TableHead>Validity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {discounts.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="font-medium">{d.name}</div>
                    {d.description && (
                      <div className="text-[11px] text-muted-foreground truncate max-w-[260px]">{d.description}</div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{d.code}</TableCell>
                  <TableCell>
                    <DiscountTypeBadge type={d.type} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[11px]">
                      {CHANNEL_LABEL[d.channel] ?? d.channel}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {MODE_LABEL[d.validationMode] ?? d.validationMode}
                  </TableCell>
                  <TableCell className="text-right">{fmtValue(d)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {d.minOrder ? inr(d.minOrder) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {d.validFrom && d.validTo
                      ? `${d.validFrom.toISOString().slice(0, 10)} → ${d.validTo.toISOString().slice(0, 10)}`
                      : d.validTo
                      ? `Until ${d.validTo.toISOString().slice(0, 10)}`
                      : d.validFrom
                      ? `From ${d.validFrom.toISOString().slice(0, 10)}`
                      : "Always"}
                  </TableCell>
                  <TableCell>
                    {d.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <DiscountDialog initial={toInit(d)} categories={categories} items={items}>
                        <Button variant="ghost" size="sm">
                          Edit
                        </Button>
                      </DiscountDialog>
                      <form action={deleteDiscount}>
                        <input type="hidden" name="id" value={d.id} />
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {discounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">
                    No discounts yet. Add a percentage, flat, BOGO or fixed-price offer.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
