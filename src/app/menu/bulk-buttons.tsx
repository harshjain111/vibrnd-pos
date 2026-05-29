"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Download, FileText } from "lucide-react";
import { exportItemsCsv, downloadTemplate, importItemsCsv } from "./bulk-actions";

/**
 * Menu Manager "Files" toolbar (audit TASK 13).
 * Three small actions: download a CSV template, upload a CSV to import, export
 * everything as a CSV for backup or off-line edits.
 */
export function MenuBulkButtons() {
  const router = useRouter();
  const { toast } = useToast();
  const [importing, setImporting] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<Awaited<ReturnType<typeof importItemsCsv>> | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const triggerDownload = (text: string, name: string) => {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onExport = async () => {
    try {
      const csv = await exportItemsCsv();
      triggerDownload(csv, `menu-items-${new Date().toISOString().slice(0, 10)}.csv`);
      toast({ variant: "success", title: "Exported CSV" });
    } catch (e) {
      toast({ variant: "destructive", title: "Export failed", description: String(e) });
    }
  };

  const onTemplate = async () => {
    try {
      const csv = await downloadTemplate();
      triggerDownload(csv, `menu-template.csv`);
    } catch (e) {
      toast({ variant: "destructive", title: "Failed", description: String(e) });
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImporting(true);
    setOpen(true);
    setResult(null);
    try {
      const text = await f.text();
      const r = await importItemsCsv(text);
      setResult(r);
      if (r.errors.length === 0) {
        toast({ variant: "success", title: `Imported ${r.inserted + r.updated} items`, description: `${r.inserted} new, ${r.updated} updated` });
      } else {
        toast({ variant: "destructive", title: "Imported with warnings", description: `${r.errors.length} row(s) had problems` });
      }
      router.refresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Import failed", description: String(err) });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={onTemplate}>
        <FileText className="h-4 w-4" />
        Template
      </Button>
      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importing}>
        <Upload className="h-4 w-4" />
        {importing ? "Importing…" : "Import CSV"}
      </Button>
      <Button variant="outline" size="sm" onClick={onExport}>
        <Download className="h-4 w-4" />
        Export
      </Button>
      <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />

      {/* Import-results modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import results</DialogTitle>
            <DialogDescription>How your CSV was processed.</DialogDescription>
          </DialogHeader>
          {!result ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Processing…</div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Inserted" value={result.inserted} tone="good" />
                <Stat label="Updated" value={result.updated} tone="neutral" />
                <Stat label="Skipped" value={result.skipped} tone={result.skipped > 0 ? "warn" : "neutral"} />
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50/50 p-2.5 text-xs space-y-1">
                  <div className="font-semibold text-amber-900">{result.errors.length} warning(s)</div>
                  <ul className="list-disc pl-4 text-amber-800 max-h-40 overflow-y-auto">
                    {result.errors.slice(0, 20).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "good" | "warn" | "neutral" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "";
  return (
    <div className="rounded-md border p-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}
