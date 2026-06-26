import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { ArrowLeft, Plus, Printer as PrinterIcon, Trash2, AlertTriangle } from "lucide-react";
import { PrinterDialog } from "./client";
import { deletePrinter } from "./actions";

export const dynamic = "force-dynamic";

// Known stations + a friendly label. The field is free-text, so any custom
// station seen on menu items is merged in below.
const STATION_LABELS: Record<string, string> = {
  MAIN: "Main kitchen",
  TANDOOR: "Tandoor",
  BAR: "Bar",
  DESSERT: "Dessert",
};

export default async function PrintersPage() {
  await requireUser("MANAGER");
  const outlet = await getActiveOutlet();

  const [printers, itemStations] = await Promise.all([
    db.printer.findMany({ where: { outletId: outlet.id }, orderBy: [{ station: "asc" }, { name: "asc" }] }),
    db.item.findMany({ where: { outletId: outlet.id, active: true }, select: { station: true }, distinct: ["station"] }),
  ]);

  // Every station referenced by a menu item, plus the known defaults.
  const allStations = Array.from(
    new Set([...Object.keys(STATION_LABELS), ...itemStations.map((i) => (i.station || "MAIN").toUpperCase())])
  ).sort();
  const coveredStations = new Set(printers.filter((p) => p.active).map((p) => p.station.toUpperCase()));
  // Stations that actually have items routed to them but no active printer.
  const usedStations = new Set(itemStations.map((i) => (i.station || "MAIN").toUpperCase()));
  const uncovered = Array.from(usedStations).filter((s) => !coveredStations.has(s)).sort();

  const stationLabel = (s: string) => STATION_LABELS[s] ?? s.charAt(0) + s.slice(1).toLowerCase();

  return (
    <div>
      <PageHeader
        title="KOT printers"
        description="Map each kitchen station / department to a printer. When a bill is sent, its items are split into one KOT per station and routed to that station's printer."
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/settings"><ArrowLeft className="h-4 w-4" /> Settings</Link>
            </Button>
            <PrinterDialog stations={allStations}>
              <Button size="sm"><Plus className="h-4 w-4" /> Add printer</Button>
            </PrinterDialog>
          </>
        }
      />

      {uncovered.length > 0 && (
        <InlineAlert
          tone="warn"
          icon={<AlertTriangle className="h-4 w-4" />}
          title={`${uncovered.length} department${uncovered.length === 1 ? "" : "s"} have no active printer`}
          className="mb-4"
        >
          Items in these stations won&apos;t reach a printer until you add one:{" "}
          <strong>{uncovered.map(stationLabel).join(", ")}</strong>.
        </InlineAlert>
      )}

      <Card>
        <CardContent className="p-0">
          {printers.length === 0 ? (
            <Empty
              icon={PrinterIcon}
              title="No printers yet"
              desc="Add a printer and assign it to a station (Main kitchen, Bar, Tandoor, Dessert)."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Printer</TableHead>
                  <TableHead>Department / station</TableHead>
                  <TableHead>Device target</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {printers.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium inline-flex items-center gap-1.5">
                      <PrinterIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      {p.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">{stationLabel(p.station.toUpperCase())}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{p.target ?? "— agent default"}</TableCell>
                    <TableCell>
                      {p.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <PrinterDialog
                          stations={allStations}
                          initial={{ id: p.id, name: p.name, station: p.station.toUpperCase(), target: p.target ?? "", active: p.active }}
                        >
                          <Button variant="ghost" size="sm">Edit</Button>
                        </PrinterDialog>
                        <form action={deletePrinter}>
                          <input type="hidden" name="id" value={p.id} />
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
