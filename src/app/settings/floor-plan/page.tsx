import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { FloorPlanEditor } from "./client";

export const dynamic = "force-dynamic";

export default async function FloorPlanSettingsPage() {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const tables = await db.diningTable.findMany({
    where: { outletId: outlet.id, active: true },
    orderBy: [{ area: "asc" }, { name: "asc" }],
  });

  return (
    <div>
      <PageHeader
        title="Floor plan"
        description="Drop tables on the canvas where they sit in your restaurant. Drag to reposition. Tap a table to edit name / area / capacity."
      />

      <Card className="mb-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">How this works</CardTitle>
          <CardDescription>
            Each table can belong to an area (Ground / Terrace / AC / Garden …). Click an empty spot on the
            canvas to add a table, drag any table to move it, click an existing table to edit it. Captains
            then tap tables from the same plan on the POS Home screen to start or continue an order.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="p-3">
          <FloorPlanEditor
            initial={tables.map((t) => ({
              id: t.id,
              name: t.name,
              area: t.area,
              capacity: t.capacity,
              posX: t.posX,
              posY: t.posY,
              shape: t.shape as "ROUND" | "SQUARE" | "RECT",
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
