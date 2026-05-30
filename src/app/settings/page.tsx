import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { saveOutlet, deleteTable, setTaxInclusive } from "./actions";
import { TableDialog } from "./client";
import { Plus, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();
  const tables = await db.diningTable.findMany({
    where: { outletId: outlet.id },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader title="Settings" description="Outlet configuration, dining tables, and operational defaults" />

      <Tabs defaultValue="outlet">
        <TabsList>
          <TabsTrigger value="outlet">Outlet</TabsTrigger>
          <TabsTrigger value="tables">Dining tables ({tables.length})</TabsTrigger>
          <TabsTrigger value="ops">Operations</TabsTrigger>
        </TabsList>

        <TabsContent value="outlet">
          <Card>
            <CardHeader>
              <CardTitle>Outlet details</CardTitle>
              <CardDescription>Used on invoices, ebills, and aggregator menus.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={saveOutlet} className="grid grid-cols-2 gap-4">
                <input type="hidden" name="id" value={outlet.id} />
                <div className="col-span-2">
                  <Label>Outlet name</Label>
                  <Input name="name" defaultValue={outlet.name} required />
                </div>
                <div>
                  <Label>Outlet code</Label>
                  <Input name="code" defaultValue={outlet.code} required />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Input name="currency" defaultValue={outlet.currency} maxLength={8} />
                </div>
                <div className="col-span-2">
                  <Label>Address</Label>
                  <Input name="address" defaultValue={outlet.address ?? ""} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input name="phone" defaultValue={outlet.phone ?? ""} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input name="email" type="email" defaultValue={outlet.email ?? ""} />
                </div>
                <div>
                  <Label>GSTIN</Label>
                  <Input name="gstin" defaultValue={outlet.gstin ?? ""} placeholder="29ABCDE1234F1Z5" />
                </div>
                <div>
                  <Label>FSSAI license</Label>
                  <Input name="fssai" defaultValue={outlet.fssai ?? ""} placeholder="10012345000123" />
                </div>
                <div>
                  <Label>Timezone</Label>
                  <Input name="timezone" defaultValue={outlet.timezone} />
                </div>
                <div className="col-span-2 flex justify-end gap-2">
                  <Button type="submit">Save outlet</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tables">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Dining tables</CardTitle>
                <CardDescription>Manage your floor plan. These show up in billing and live orders.</CardDescription>
              </div>
              <TableDialog>
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  Add table
                </Button>
              </TableDialog>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead className="text-right">Capacity</TableHead>
                    <TableHead className="text-right w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tables.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-muted-foreground">{t.area}</TableCell>
                      <TableCell className="text-right">{t.capacity}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <TableDialog initial={{ id: t.id, name: t.name, area: t.area, capacity: t.capacity }}>
                            <Button variant="ghost" size="sm">
                              Edit
                            </Button>
                          </TableDialog>
                          <form action={deleteTable}>
                            <input type="hidden" name="id" value={t.id} />
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ops">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Auto consumption</CardTitle>
                <CardDescription>Reduce raw-material stock when an item with a recipe sells.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Toggle label="Auto-consume on POS orders" defaultChecked />
                <Toggle label="Auto-consume on online orders" defaultChecked />
                <Toggle label="Reverse on cancellation (until READY)" defaultChecked />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>Where alerts surface for the team.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Toggle label="POS notification at par level" defaultChecked />
                <Toggle label="POS notification at min level" defaultChecked />
                <Toggle label="Auto mark item out-of-stock at min" />
                <Toggle label="Kitchen notification at par" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Invoice</CardTitle>
                <CardDescription>Numbering and tax handling.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <form action={setTaxInclusive} className="space-y-3">
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <div>
                      <div>Tax-inclusive prices on menu</div>
                      <div className="text-xs text-muted-foreground">
                        When ON, ₹100 means customer pays ₹100. When OFF, ₹100 + GST is charged.
                      </div>
                    </div>
                    <input type="checkbox" name="taxInclusive" defaultChecked={outlet.taxInclusive} className="h-4 w-4" />
                  </label>
                  <label className="flex items-center justify-between gap-3 cursor-pointer pt-2 border-t">
                    <div>
                      <div>Use Kitchen Display (KDS)</div>
                      <div className="text-xs text-muted-foreground">
                        When ON, Send KOT pushes the ticket to <code>/kds</code>. When OFF, the
                        button label becomes <strong>Print KOT</strong> and opens a printable
                        ticket in a new tab.
                      </div>
                    </div>
                    <input type="checkbox" name="kdsEnabled" defaultChecked={(outlet as any).kdsEnabled ?? true} className="h-4 w-4" />
                  </label>
                  <Button type="submit" size="sm" variant="outline">
                    Save invoice settings
                  </Button>
                </form>
                <div className="opacity-60 pointer-events-none">
                  <Toggle label="Round-off grand total" defaultChecked />
                  <Toggle label="Print GST breakup on receipt" defaultChecked />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Online orders</CardTitle>
                <CardDescription>Defaults for Swiggy/Zomato/etc.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Toggle label="Auto-accept new orders" />
                <Toggle label="Push item on/off to aggregator" defaultChecked />
                <Toggle label="Capture cancellation reason" defaultChecked />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Toggle({ label, defaultChecked }: { label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span>{label}</span>
      <input type="checkbox" defaultChecked={defaultChecked} className="h-4 w-4" />
    </label>
  );
}
