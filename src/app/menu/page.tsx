import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { inr } from "@/lib/utils";
import { Plus, Search, Settings2 } from "lucide-react";
import { ItemDialog, CategoryDialog, OutOfStockToggle, DeleteItemBtn, TaxSlabDialog, DeleteTaxSlabBtn } from "./client";
import { Input } from "@/components/ui/input";
import { DietaryDot } from "@/components/ui/dietary-dot";
import { MenuBulkButtons } from "./bulk-buttons";

export const dynamic = "force-dynamic";

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const outlet = await getActiveOutlet();

  const [items, categories, taxSlabs] = await Promise.all([
    db.item.findMany({
      where: {
        outletId: outlet.id,
        ...(sp.q ? { name: { contains: sp.q, mode: "insensitive" as const } } : {}),
      },
      include: {
        category: true,
        variants: { orderBy: { rank: "asc" } },
        addons: { orderBy: { rank: "asc" } },
        _count: { select: { variants: true, addons: true } },
      },
      orderBy: [{ category: { rank: "asc" } }, { name: "asc" }],
    }),
    db.category.findMany({
      where: { outletId: outlet.id },
      include: { _count: { select: { items: true } } },
      orderBy: { rank: "asc" },
    }),
    db.taxSlab.findMany({ where: { outletId: outlet.id }, orderBy: { rate: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Menu manager"
        description={`${items.length} items · ${categories.length} categories`}
        actions={
          <>
            <MenuBulkButtons />
            <CategoryDialog>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4" />
                Category
              </Button>
            </CategoryDialog>
            <ItemDialog
              categories={categories.map((c) => ({ id: c.id, name: c.name }))}
              taxSlabs={taxSlabs.map((t) => ({ name: t.name, rate: t.rate }))}
            >
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Item
              </Button>
            </ItemDialog>
          </>
        }
      />

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Items ({items.length})</TabsTrigger>
          <TabsTrigger value="categories">Categories ({categories.length})</TabsTrigger>
          <TabsTrigger value="taxes">Tax slabs ({taxSlabs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="items">
          <Card>
            <CardContent className="p-3">
              <form className="relative" action="/menu" method="GET">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search items…" className="pl-8 max-w-sm" />
              </form>
            </CardContent>
          </Card>
          <Card className="mt-3">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead>Modifiers</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-44 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {it.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={it.imageUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                          ) : (
                            <div className="h-8 w-8 rounded bg-muted grid place-items-center shrink-0 text-[10px] font-semibold text-muted-foreground uppercase">
                              {it.name.slice(0, 2)}
                            </div>
                          )}
                          <DietaryDot value={(it as any).dietary || (it.isVeg ? "VEG" : "NON_VEG")} />
                          <div>
                            <div className="font-medium">{it.name}</div>
                            {it.shortCode && <div className="text-xs text-muted-foreground">{it.shortCode}</div>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{it.category.name}</TableCell>
                      <TableCell className="text-right font-medium">{inr(it.price)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{it.taxRate}%</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {it._count.variants > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              {it._count.variants} variants
                            </Badge>
                          )}
                          {it._count.addons > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              {it._count.addons} addons
                            </Badge>
                          )}
                          {it._count.variants === 0 && it._count.addons === 0 && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {!it.active ? (
                          <Badge variant="destructive">Inactive</Badge>
                        ) : it.outOfStock ? (
                          <Badge variant="warning">Out of stock</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <OutOfStockToggle id={it.id} outOfStock={it.outOfStock} />
                          <ItemDialog
                            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
                            taxSlabs={taxSlabs.filter((t) => t.active).map((t) => ({ name: t.name, rate: t.rate }))}
                            initial={{
                              id: it.id,
                              name: it.name,
                              shortCode: it.shortCode ?? "",
                              description: it.description ?? "",
                              price: it.price,
                              taxRate: it.taxRate,
                              categoryId: it.categoryId,
                              isVeg: it.isVeg,
                              active: it.active,
                              outOfStock: it.outOfStock,
                              variants: it.variants.map((v) => ({ id: v.id, name: v.name, price: v.price })),
                              addons: it.addons.map((a) => ({ id: a.id, name: a.name, priceDelta: a.priceDelta })),
                            }}
                          >
                            <Button variant="ghost" size="sm">
                              Edit
                            </Button>
                          </ItemDialog>
                          <DeleteItemBtn id={it.id} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Rank</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{c._count.items}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{c.rank}</TableCell>
                      <TableCell className="text-right">
                        <CategoryDialog initial={{ id: c.id, name: c.name, rank: c.rank }}>
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        </CategoryDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="taxes">
          <div className="flex justify-end mb-3">
            <TaxSlabDialog>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Tax slab
              </Button>
            </TaxSlabDialog>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taxSlabs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                        No tax slabs yet. Add GST 5%, 12%, 18%, etc.
                      </TableCell>
                    </TableRow>
                  ) : (
                    taxSlabs.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="text-right font-semibold">{t.rate}%</TableCell>
                        <TableCell>
                          {t.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <TaxSlabDialog initial={{ id: t.id, name: t.name, rate: t.rate, active: t.active }}>
                              <Button variant="ghost" size="sm">Edit</Button>
                            </TaxSlabDialog>
                            <DeleteTaxSlabBtn id={t.id} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
