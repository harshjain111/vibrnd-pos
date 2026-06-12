import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { ChefHat, Plus, AlertTriangle } from "lucide-react";
import { ProductionMasterDialog, DeleteMasterBtn, RunBtn } from "./client";

export const dynamic = "force-dynamic";

export default async function ProductionPage() {
  const outlet = await getActiveOutlet();
  const outletKind = (outlet as any).kind ?? "OUTLET";
  const isBK = outletKind === "BASE_KITCHEN";
  const [masters, runs, rms, units] = await Promise.all([
    db.productionMaster.findMany({
      where: { outletId: outlet.id, active: true },
      include: { outputRM: true, inputs: { include: { rawMaterial: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.productionRun.findMany({
      where: { outletId: outlet.id },
      include: { master: { include: { outputRM: true } } },
      orderBy: { executedAt: "desc" },
      take: 50,
    }),
    db.rawMaterial.findMany({ where: { outletId: outlet.id, active: true }, orderBy: { name: "asc" } }),
    db.unit.findMany({ where: { outletId: outlet.id, active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Production"
        description={
          isBK
            ? "Central commissary — runs decrement inputs from this BK's store and roll the cost forward into the produced item's avg cost."
            : "Define a conversion (inputs → output) and run batches. Input stock decrements, output stock increments."
        }
        actions={
          <ProductionMasterDialog
            rawMaterials={rms.map((r) => ({ id: r.id, name: r.name, unit: r.consumptionUnit ?? r.unit }))}
            units={units.map((u) => u.name)}
          >
            <Button size="sm"><Plus className="h-4 w-4" />New process</Button>
          </ProductionMasterDialog>
        }
      />

      {!isBK && (
        <Card className="mb-3 border-amber-300 bg-amber-50/50">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-amber-900 text-sm">
                Not a Base Kitchen
              </div>
              <div className="text-sm text-amber-800 mt-0.5">
                This outlet's kind is <strong>{outletKind}</strong>. Production runs work
                here but conceptually belong at a Base Kitchen — switch outlets via the
                location switcher to a BK to run chain-level production. (Owner can also
                promote this outlet's kind from <strong>/outlets</strong>.)
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isBK && (
        <Card className="mb-3 border-sky-300 bg-sky-50/50">
          <CardContent className="p-3 flex items-start gap-2">
            <ChefHat className="h-4 w-4 text-sky-700 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-sky-900 text-sm">
                {outlet.name} — Base Kitchen
              </div>
              <div className="text-sm text-sky-800 mt-0.5">
                Define a process master (recipe), then run batches. Each run consumes from
                this BK's store, produces semi-finished goods that ship to outlets via
                CHAIN transfers. Output cost = sum(input cost) ÷ output qty, rolled into
                the produced raw material's avg cost.
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <Tabs defaultValue="masters">
        <TabsList>
          <TabsTrigger value="masters">Process Master ({masters.length})</TabsTrigger>
          <TabsTrigger value="runs">Execution Log ({runs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="masters">
          {masters.length === 0 ? (
            <Card><CardContent><Empty title="No production processes" desc="Tap New process — define inputs and output." /></CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {masters.map((m) => (
                <Card key={m.id}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center justify-between">
                      {m.name}
                      <Badge variant="outline" className="text-[10px]">default {m.defaultQty} run</Badge>
                    </CardTitle>
                    <CardDescription>
                      Produces <strong>{m.outputQty} {m.outputUnit}</strong> of <strong>{m.outputRM.name}</strong> per run
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Inputs</div>
                    <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                      {m.inputs.map((i) => (
                        <li key={i.id}>
                          {i.qty} {i.unit} {i.rawMaterial.name}
                        </li>
                      ))}
                    </ul>
                    <div className="flex justify-end gap-1 pt-2">
                      <ProductionMasterDialog
                        rawMaterials={rms.map((r) => ({ id: r.id, name: r.name, unit: r.consumptionUnit ?? r.unit }))}
                        units={units.map((u) => u.name)}
                        initial={{
                          id: m.id,
                          name: m.name,
                          description: m.description ?? "",
                          defaultQty: m.defaultQty,
                          outputRMId: m.outputRMId,
                          outputQty: m.outputQty,
                          outputUnit: m.outputUnit,
                          inputs: m.inputs.map((i) => ({ rawMaterialId: i.rawMaterialId, qty: i.qty, unit: i.unit })),
                        }}
                      >
                        <Button variant="ghost" size="sm">Edit</Button>
                      </ProductionMasterDialog>
                      <DeleteMasterBtn id={m.id} />
                      <RunBtn masterId={m.id} name={m.name} defaultQty={m.defaultQty} outputName={m.outputRM.name} outputQty={m.outputQty} outputUnit={m.outputUnit} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="runs">
          {runs.length === 0 ? (
            <Card><CardContent><Empty title="No runs yet" desc="Open a process and tap Execute to run a batch." /></CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Process</TableHead>
                      <TableHead className="text-right">Run qty</TableHead>
                      <TableHead className="text-right">Produced</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.executedAt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </TableCell>
                        <TableCell className="font-medium">{r.master.name}</TableCell>
                        <TableCell className="text-right">{r.runQty}</TableCell>
                        <TableCell className="text-right text-emerald-700">
                          {r.master.outputQty * r.runQty} {r.master.outputUnit} {r.master.outputRM.name}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{r.type.replace("_", " ")}</Badge></TableCell>
                        <TableCell><Badge variant={r.status === "EXECUTED" ? "success" : "secondary"} className="text-[10px]">{r.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
