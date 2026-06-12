"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Download, AlertCircle, Sparkles } from "lucide-react";

type Outlet = { id: string; name: string; code: string; kind: string };
type Dept = { id: string; name: string; kind: string; outletId: string };
type Row = {
  name: string;
  unit: string;
  category: string;
  chainTotal: number;
  parLevel: number;
  isLow: boolean;
  isProduced: boolean;
  cells: Record<string, number>; // `outletId::deptId` → qty
};

const KIND_BADGE: Record<string, { color: string; short: string }> = {
  OUTLET: { color: "bg-slate-100 text-slate-700 border-slate-300", short: "Outlet" },
  BASE_STORE: { color: "bg-sky-50 text-sky-800 border-sky-300", short: "BS" },
  BASE_KITCHEN: { color: "bg-amber-50 text-amber-800 border-amber-300", short: "BK" },
};

export function ChainStockClient({
  outlets,
  departments,
  rows,
  categories,
  activeFilters,
}: {
  outlets: Outlet[];
  departments: Dept[];
  rows: Row[];
  categories: string[];
  activeFilters: { low: boolean; cat: string };
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");

  // Group departments by outlet for the spanning header.
  const deptsByOutlet = React.useMemo(() => {
    const m = new Map<string, Dept[]>();
    for (const d of departments) {
      const arr = m.get(d.outletId) ?? [];
      arr.push(d);
      m.set(d.outletId, arr);
    }
    return m;
  }, [departments]);

  const setFilter = (key: "low" | "cat", value: string) => {
    const params = new URLSearchParams();
    if (key === "low") {
      if (value === "1") params.set("low", "1");
    } else if (activeFilters.low) params.set("low", "1");
    if (key === "cat") {
      if (value) params.set("cat", value);
    } else if (activeFilters.cat) params.set("cat", activeFilters.cat);
    router.push(`/inventory/reports/chain-stock${params.toString() ? `?${params.toString()}` : ""}`);
  };

  // CSV export — straightforward 2D dump for spreadsheet drill.
  const exportCsv = () => {
    const headers = [
      "Item",
      "Unit",
      "Category",
      "Chain total",
      "Par level",
      "Low?",
      ...outlets.flatMap((o) =>
        (deptsByOutlet.get(o.id) ?? []).map((d) => `${o.code} / ${d.name}`)
      ),
    ];
    const lines = [headers.join(",")];
    for (const r of filteredRows) {
      const cells = outlets.flatMap((o) =>
        (deptsByOutlet.get(o.id) ?? []).map((d) => {
          const q = r.cells[`${o.id}::${d.id}`] ?? 0;
          return q ? String(q) : "";
        })
      );
      lines.push(
        [
          `"${r.name}"`,
          r.unit,
          `"${r.category}"`,
          String(r.chainTotal),
          String(r.parLevel),
          r.isLow ? "yes" : "",
          ...cells,
        ].join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chain-stock-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredRows = search
    ? rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
    : rows;

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent>
          <Empty
            title="Nothing matches"
            desc="Try removing the low-stock filter or picking a different category."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items…"
          className="h-9 rounded-md border bg-background px-3 text-sm w-64"
        />
        <button
          type="button"
          onClick={() => setFilter("low", activeFilters.low ? "" : "1")}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
            activeFilters.low ? "bg-rose-600 text-white border-rose-600" : "bg-background hover:bg-accent"
          }`}
        >
          <AlertCircle className="h-3.5 w-3.5" />
          Below par only
        </button>
        <select
          value={activeFilters.cat}
          onChange={(e) => setFilter("cat", e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-xs"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Matrix — sticky first column, scrollable horizontally */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="text-xs border-collapse min-w-full">
            <thead>
              {/* Row 1 — outlet group headers (span their depts) */}
              <tr className="border-b-2 bg-muted/60">
                <th className="sticky left-0 z-20 bg-muted/60 p-2 text-left min-w-[200px] border-r">
                  Item
                </th>
                <th className="sticky left-[200px] z-20 bg-muted/60 p-2 text-right border-r min-w-[100px]">
                  Chain total
                </th>
                {outlets.map((o) => {
                  const ds = deptsByOutlet.get(o.id) ?? [];
                  if (ds.length === 0) return null;
                  const cfg = KIND_BADGE[o.kind] ?? KIND_BADGE.OUTLET;
                  return (
                    <th
                      key={o.id}
                      colSpan={ds.length}
                      className={`p-2 text-center border-r border-l text-[11px] ${cfg.color}`}
                    >
                      <div className="font-semibold">{o.name}</div>
                      <div className="text-[9px] uppercase tracking-wider opacity-70">
                        {cfg.short} · {o.code}
                      </div>
                    </th>
                  );
                })}
              </tr>
              {/* Row 2 — dept sub-headers */}
              <tr className="border-b bg-muted/40">
                <th className="sticky left-0 z-20 bg-muted/40 p-2 text-left border-r"></th>
                <th className="sticky left-[200px] z-20 bg-muted/40 p-2 border-r"></th>
                {outlets.map((o) => {
                  const ds = deptsByOutlet.get(o.id) ?? [];
                  return ds.map((d, i) => (
                    <th
                      key={d.id}
                      className={`p-1.5 text-center font-medium text-[10px] ${
                        i === 0 ? "border-l" : ""
                      }`}
                    >
                      {d.name}
                    </th>
                  ));
                })}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.name} className="border-b hover:bg-accent/30">
                  <td className="sticky left-0 bg-background p-2 font-medium border-r min-w-[200px]">
                    <div className="flex items-center gap-1.5">
                      <span>{r.name}</span>
                      {r.isProduced && (
                        <Badge variant="info" className="text-[8px] py-0 px-1">
                          <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                          PROD
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{r.category || "—"}</div>
                  </td>
                  <td className="sticky left-[200px] bg-background p-2 text-right border-r font-semibold">
                    <div className={r.isLow ? "text-rose-700" : ""}>
                      {r.chainTotal.toFixed(2)}
                      <span className="ml-0.5 text-[10px] text-muted-foreground">{r.unit}</span>
                    </div>
                    {r.parLevel > 0 && (
                      <div className="text-[9px] text-muted-foreground">par {r.parLevel}</div>
                    )}
                  </td>
                  {outlets.map((o) => {
                    const ds = deptsByOutlet.get(o.id) ?? [];
                    return ds.map((d, i) => {
                      const q = r.cells[`${o.id}::${d.id}`] ?? 0;
                      return (
                        <td
                          key={d.id}
                          className={`p-1.5 text-right tabular-nums ${i === 0 ? "border-l" : ""} ${
                            q === 0 ? "text-muted-foreground/40" : ""
                          }`}
                        >
                          {q > 0 ? q.toFixed(2) : "—"}
                        </td>
                      );
                    });
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground mt-3">
        Per-cell quantity is computed by summing the stock-movement ledger filtered to (raw
        material, department). STORE columns include legacy un-backfilled movements from
        before chain inventory landed. <span className="font-medium">PROD</span> badge marks
        items that have been produced at a Base Kitchen at least once.
      </div>
    </>
  );
}
