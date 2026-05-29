import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { inr } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { VariantEditor, AddonEditor } from "./client";

export const dynamic = "force-dynamic";

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const outlet = await getActiveOutlet();
  const item = await db.item.findFirst({
    where: { id, outletId: outlet.id },
    include: { category: true, variants: { orderBy: { rank: "asc" } }, addons: { orderBy: { rank: "asc" } } },
  });
  if (!item) return notFound();

  return (
    <div>
      <PageHeader
        title={item.name}
        description={`${item.category.name} · base ${inr(item.price)} · GST ${item.taxRate}%`}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/menu">
              <ArrowLeft className="h-4 w-4" />
              Back to menu
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span
              className={`h-4 w-4 rounded-sm border ${item.isVeg ? "border-emerald-600" : "border-rose-600"} flex items-center justify-center`}
            >
              <span className={`h-2 w-2 rounded-full ${item.isVeg ? "bg-emerald-600" : "bg-rose-600"}`} />
            </span>
            <div>
              <div className="text-xs text-muted-foreground">Diet</div>
              <div className="font-medium">{item.isVeg ? "Vegetarian" : "Non-vegetarian"}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Variants</div>
            <div className="text-xl font-semibold mt-0.5">{item.variants.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Addons</div>
            <div className="text-xl font-semibold mt-0.5">{item.addons.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Variants</CardTitle>
          <CardDescription>
            Add Half / Full / Small / Medium / Large variations with their own absolute price. When set, billing prompts the cashier to pick one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VariantEditor
            itemId={item.id}
            basePrice={item.price}
            initial={item.variants.map((v) => ({ id: v.id, name: v.name, price: v.price }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Addons</CardTitle>
          <CardDescription>Optional modifiers — extra cheese, less spicy, no onion, etc. Price delta adds (or subtracts) from the base.</CardDescription>
        </CardHeader>
        <CardContent>
          <AddonEditor
            itemId={item.id}
            initial={item.addons.map((a) => ({ id: a.id, name: a.name, priceDelta: a.priceDelta }))}
          />
        </CardContent>
      </Card>

      <div className="mt-4 text-xs text-muted-foreground">
        Tip: Save updates immediately reload billing — you don't need to restart anything.
      </div>
    </div>
  );
}
