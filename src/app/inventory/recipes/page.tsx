import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { RecipeEditor } from "./client";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const outlet = await getActiveOutlet();
  const [items, rms] = await Promise.all([
    db.item.findMany({
      where: { outletId: outlet.id, active: true },
      include: { recipe: { include: { ingredients: { include: { rawMaterial: true } } } }, category: true },
      orderBy: [{ category: { rank: "asc" } }, { name: "asc" }],
    }),
    db.rawMaterial.findMany({ where: { outletId: outlet.id }, orderBy: { name: "asc" } }),
  ]);

  const withRecipe = items.filter((i) => i.recipe);

  return (
    <div>
      <PageHeader
        title="Recipes"
        description={`${withRecipe.length} of ${items.length} items have a recipe. Recipes drive auto-consumption from stock when an order is settled.`}
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Sell price</TableHead>
                <TableHead className="text-right">Recipe cost</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead>Ingredients</TableHead>
                <TableHead className="text-right w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => {
                const cost = it.recipe?.ingredients.reduce((s, ing) => s + ing.qty * ing.rawMaterial.avgCost, 0) ?? 0;
                const margin = it.price > 0 ? ((it.price - cost) / it.price) * 100 : 0;
                return (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.name}</TableCell>
                    <TableCell className="text-muted-foreground">{it.category.name}</TableCell>
                    <TableCell className="text-right">{inr(it.price)}</TableCell>
                    <TableCell className="text-right">{it.recipe ? inr(cost) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right">
                      {it.recipe ? (
                        <Badge variant={margin > 60 ? "success" : margin > 40 ? "info" : "warning"}>
                          {margin.toFixed(0)}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {it.recipe ? (
                        <div className="text-xs text-muted-foreground">
                          {it.recipe.ingredients
                            .map((ing) => `${ing.qty}${ing.unit} ${ing.rawMaterial.name}`)
                            .join(" · ")}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No recipe</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <RecipeEditor
                        itemId={it.id}
                        itemName={it.name}
                        rms={rms.map((r) => ({ id: r.id, name: r.name, unit: r.unit }))}
                        initial={
                          it.recipe?.ingredients.map((ing) => ({
                            rawMaterialId: ing.rawMaterialId,
                            qty: ing.qty,
                            unit: ing.unit,
                          })) ?? []
                        }
                      >
                        <Button variant="ghost" size="sm">
                          {it.recipe ? "Edit" : "Set"}
                        </Button>
                      </RecipeEditor>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
