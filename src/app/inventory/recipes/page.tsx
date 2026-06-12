import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { Plus } from "lucide-react";
import { RecipeEditor, NewRecipeButton } from "./client";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const outlet = await getActiveOutlet();

  // Only items with at least one variant — per user direction. Items
  // without variants are out of scope for this list.
  const items = await db.item.findMany({
    where: { outletId: outlet.id, active: true, variants: { some: {} } },
    include: {
      variants: { orderBy: { rank: "asc" } },
      addons: { orderBy: { rank: "asc" } },
      recipes: {
        include: { ingredients: { include: { rawMaterial: true } } },
      },
    },
    orderBy: { name: "asc" },
  });
  const rms = await db.rawMaterial.findMany({
    where: { outletId: outlet.id, active: true },
    select: { id: true, name: true, unit: true, avgCost: true },
    orderBy: { name: "asc" },
  });

  // One row per (item, variant) pair.
  type RowConfigured = {
    kind: "configured";
    item: (typeof items)[number];
    variant: (typeof items)[number]["variants"][number];
    recipe: NonNullable<(typeof items)[number]["recipes"][number]>;
  };
  type RowEmpty = {
    kind: "empty";
    item: (typeof items)[number];
    variant: (typeof items)[number]["variants"][number];
  };
  type Row = RowConfigured | RowEmpty;

  const rows: Row[] = [];
  for (const item of items) {
    for (const variant of item.variants) {
      const recipe = item.recipes.find((r) => r.itemVariantId === variant.id);
      if (recipe) {
        rows.push({ kind: "configured", item, variant, recipe });
      } else {
        rows.push({ kind: "empty", item, variant });
      }
    }
  }
  const configuredCount = rows.filter((r) => r.kind === "configured").length;

  const formattedItems = items.map((i) => ({
    id: i.id,
    name: i.name,
    variants: i.variants.map((v) => ({ id: v.id, name: v.name, price: v.price })),
    addons: i.addons.map((a) => ({ id: a.id, name: a.name, priceDelta: a.priceDelta })),
  }));
  const formattedRms = rms.map((r) => ({
    id: r.id,
    name: r.name,
    unit: r.unit,
    avgCost: r.avgCost,
  }));

  return (
    <div>
      <PageHeader
        title="Recipes"
        description={`${configuredCount} of ${rows.length} variant recipes configured · drives auto-consumption when an order settles`}
        actions={
          <NewRecipeButton items={formattedItems} rms={formattedRms}>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New recipe
            </Button>
          </NewRecipeButton>
        }
      />

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <Empty
              title="No variants yet"
              desc="Recipes are per item-variant. Add variants to an item in Menu Manager — e.g. Burger (Veg) / Burger (Chicken) — then come back here to configure their recipes."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead className="text-right">Variant price</TableHead>
                  <TableHead className="text-right">Recipe cost</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead>Ingredients</TableHead>
                  <TableHead className="text-right w-24">Status</TableHead>
                  <TableHead className="text-right w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const { item, variant } = row;
                  let cost = 0;
                  let ingredientSummary = "Not set";
                  let isConfigured = false;
                  let initialBase: { rawMaterialId: string; qty: number; unit: string }[] = [];
                  let initialAddons: {
                    addonId: string;
                    ingredients: { rawMaterialId: string; qty: number; unit: string }[];
                  }[] = [];
                  if (row.kind === "configured") {
                    isConfigured = true;
                    const baseIngs = row.recipe.ingredients.filter((ing) => ing.addonId === null);
                    cost = baseIngs.reduce(
                      (s, ing) => s + ing.qty * ing.rawMaterial.avgCost,
                      0
                    );
                    initialBase = baseIngs.map((ing) => ({
                      rawMaterialId: ing.rawMaterialId,
                      qty: ing.qty,
                      unit: ing.unit,
                    }));
                    // Group addon ingredients by addonId.
                    const byAddon = new Map<
                      string,
                      { rawMaterialId: string; qty: number; unit: string }[]
                    >();
                    for (const ing of row.recipe.ingredients) {
                      if (!ing.addonId) continue;
                      const arr = byAddon.get(ing.addonId) ?? [];
                      arr.push({ rawMaterialId: ing.rawMaterialId, qty: ing.qty, unit: ing.unit });
                      byAddon.set(ing.addonId, arr);
                    }
                    initialAddons = Array.from(byAddon.entries()).map(
                      ([addonId, ingredients]) => ({ addonId, ingredients })
                    );
                    if (baseIngs.length > 0) {
                      ingredientSummary = baseIngs
                        .slice(0, 4)
                        .map((ing) => `${ing.qty}${ing.unit} ${ing.rawMaterial.name}`)
                        .join(" · ");
                      if (baseIngs.length > 4) ingredientSummary += ` +${baseIngs.length - 4}`;
                    } else {
                      ingredientSummary = "Addons only";
                    }
                  }
                  const margin = variant.price > 0 ? ((variant.price - cost) / variant.price) * 100 : 0;
                  return (
                    <TableRow key={`${item.id}-${variant.id}`} className="hover:bg-accent/30">
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {variant.name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{inr(variant.price)}</TableCell>
                      <TableCell className="text-right">
                        {isConfigured ? (
                          inr(cost)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isConfigured ? (
                          <Badge
                            variant={
                              margin > 60 ? "success" : margin > 40 ? "info" : "warning"
                            }
                          >
                            {margin.toFixed(0)}%
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                        {ingredientSummary}
                      </TableCell>
                      <TableCell className="text-right">
                        {isConfigured ? (
                          <Badge variant="success" className="text-[10px]">Configured</Badge>
                        ) : (
                          <Badge variant="warning" className="text-[10px]">Not set</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <RecipeEditor
                          items={formattedItems}
                          rms={formattedRms}
                          initial={{
                            itemId: item.id,
                            itemVariantId: variant.id,
                            base: initialBase,
                            addons: initialAddons,
                          }}
                          lockSelection
                        >
                          <Button variant="ghost" size="sm">
                            {isConfigured ? "Edit" : "Set"}
                          </Button>
                        </RecipeEditor>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
