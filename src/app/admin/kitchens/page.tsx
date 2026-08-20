import Link from "next/link";
import { revalidatePath } from "next/cache";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { logActivity } from "@/lib/audit";
import { ArrowLeft, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

// Kitchens admin — routing map. Every dish belongs to exactly one
// kitchen. Adding a kitchen here creates a new board tab on /kds and a
// new option in the item routing picker.
export default async function KitchensAdminPage() {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();

  const [kitchens, unrouted] = await Promise.all([
    db.kitchen.findMany({
      where: { outletId: outlet.id },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { items: true } } },
    }),
    db.item.count({
      where: { outletId: outlet.id, active: true, kitchenId: null },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Kitchens"
        description="Routing map for the KDS. Every dish belongs to exactly one kitchen; adding one here adds a new board tab on /kds."
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/kds">
                <ArrowLeft className="h-4 w-4" />
                KDS board
              </Link>
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4">
          <form action={createKitchen} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_120px_auto] gap-2 items-end">
            <div>
              <Label htmlFor="code">Code</Label>
              <Input id="code" name="code" placeholder="TANDOOR" required maxLength={20} />
            </div>
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="Tandoor" required maxLength={60} />
            </div>
            <div>
              <Label htmlFor="sortOrder">Sort</Label>
              <Input id="sortOrder" name="sortOrder" type="number" defaultValue={kitchens.length} />
            </div>
            <Button type="submit" size="sm">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {kitchens.length === 0 ? (
            <Empty title="No kitchens yet" desc="Add MAIN first, then any specialised stations (Tandoor, Bar, Dessert)." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Dishes routed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {kitchens.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-mono text-xs">{k.code}</TableCell>
                    <TableCell>{k.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {k._count.items}
                    </TableCell>
                    <TableCell>
                      {k.isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Off</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={toggleKitchen}>
                        <input type="hidden" name="id" value={k.id} />
                        <input type="hidden" name="active" value={String(!k.isActive)} />
                        <Button variant="ghost" size="sm" type="submit">
                          {k.isActive ? "Turn off" : "Turn on"}
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {unrouted > 0 && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50/50 p-3 text-xs text-amber-900 flex items-center justify-between">
          <span>
            <b>{unrouted}</b> dish{unrouted === 1 ? "" : "es"} not routed to any kitchen. They fall back to the first
            active kitchen when punched.
          </span>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/menu">Fix in Menu</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

async function createKitchen(fd: FormData) {
  "use server";
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const code = String(fd.get("code") ?? "").trim().toUpperCase();
  const name = String(fd.get("name") ?? "").trim();
  const sortOrder = Number(fd.get("sortOrder") ?? 0);
  if (!code || !name) return;
  await db.kitchen.upsert({
    where: { outletId_code: { outletId: outlet.id, code } },
    create: { outletId: outlet.id, code, name, sortOrder },
    update: { name, sortOrder },
  });
  await logActivity({
    action: "CREATE",
    entity: "Order",
    entityId: outlet.id,
    summary: `Created / updated kitchen ${code}`,
    outletId: outlet.id,
  });
  revalidatePath("/admin/kitchens");
  revalidatePath("/kds");
}

async function toggleKitchen(fd: FormData) {
  "use server";
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const id = String(fd.get("id") ?? "");
  const active = fd.get("active") === "true";
  if (!id) return;
  await db.kitchen.update({
    where: { id },
    data: { isActive: active },
  });
  revalidatePath("/admin/kitchens");
  revalidatePath("/kds");
}
