"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Play } from "lucide-react";
import { saveProductionMaster, deleteProductionMaster, executeProductionRun } from "./actions";

type RM = { id: string; name: string; unit: string };
type InputL = { rawMaterialId: string; qty: number; unit: string };

export function ProductionMasterDialog({
  children,
  rawMaterials,
  units,
  initial,
}: {
  children: React.ReactNode;
  rawMaterials: RM[];
  units: string[];
  initial?: {
    id: string;
    name: string;
    description: string;
    defaultQty: number;
    outputRMId: string;
    outputQty: number;
    outputUnit: string;
    inputs: InputL[];
  };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(initial?.name ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [defaultQty, setDefaultQty] = React.useState<number>(initial?.defaultQty ?? 1);
  const [outputRMId, setOutputRMId] = React.useState<string>(initial?.outputRMId ?? "");
  const [outputQty, setOutputQty] = React.useState<number>(initial?.outputQty ?? 1);
  const [outputUnit, setOutputUnit] = React.useState<string>(initial?.outputUnit ?? "");
  const [inputs, setInputs] = React.useState<InputL[]>(initial?.inputs ?? [{ rawMaterialId: "", qty: 0, unit: "" }]);
  const [pending, startTransition] = React.useTransition();

  const rmMap = React.useMemo(() => new Map(rawMaterials.map((r) => [r.id, r])), [rawMaterials]);

  const submit = () => {
    if (!name || !outputRMId || inputs.some((i) => !i.rawMaterialId || i.qty <= 0)) {
      toast({ variant: "destructive", title: "Fill all required fields" });
      return;
    }
    startTransition(async () => {
      try {
        await saveProductionMaster({
          id: initial?.id,
          name,
          description: description || undefined,
          defaultQty,
          outputRMId,
          outputQty,
          outputUnit,
          inputs,
        });
        toast({ variant: "success", title: initial?.id ? "Process updated" : "Process created" });
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't save", description: String(e) });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit production process" : "New production process"}</DialogTitle>
          <DialogDescription>
            E.g. <strong>5kg flour + 1kg ghee → 3kg dough</strong>. Inputs are deducted on every run; output is added.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Naan dough" />
            </div>
            <div className="col-span-2">
              <Label>Description (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <Label>Default qty (runs)</Label>
              <Input type="number" min="0.1" step="0.1" value={defaultQty} onChange={(e) => setDefaultQty(Number(e.target.value) || 1)} />
            </div>
          </div>

          <div className="border rounded-md p-3 bg-emerald-50/40 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Output (To Raw Material)</div>
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-6">
                <Label className="text-xs">Output RM</Label>
                <select value={outputRMId} onChange={(e) => {
                  const rm = rmMap.get(e.target.value);
                  setOutputRMId(e.target.value);
                  if (rm && !outputUnit) setOutputUnit(rm.unit);
                }} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="">—</option>
                  {rawMaterials.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="col-span-3">
                <Label className="text-xs">Qty</Label>
                <Input type="number" step="0.01" value={outputQty} onChange={(e) => setOutputQty(Number(e.target.value) || 0)} />
              </div>
              <div className="col-span-3">
                <Label className="text-xs">Unit</Label>
                <select value={outputUnit} onChange={(e) => setOutputUnit(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="">—</option>
                  {units.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="border rounded-md p-3 bg-rose-50/40 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-rose-700">Inputs (From Raw Material)</div>
            {inputs.map((inp, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-6">
                  <Label className="text-xs">Input RM</Label>
                  <select value={inp.rawMaterialId} onChange={(e) => {
                    const rm = rmMap.get(e.target.value);
                    setInputs((arr) => arr.map((x, idx) => idx === i ? { ...x, rawMaterialId: e.target.value, unit: rm?.unit ?? x.unit } : x));
                  }} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    <option value="">—</option>
                    {rawMaterials.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="col-span-3">
                  <Label className="text-xs">Qty</Label>
                  <Input type="number" step="0.01" value={inp.qty} onChange={(e) => setInputs((arr) => arr.map((x, idx) => idx === i ? { ...x, qty: Number(e.target.value) || 0 } : x))} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Unit</Label>
                  <select value={inp.unit} onChange={(e) => setInputs((arr) => arr.map((x, idx) => idx === i ? { ...x, unit: e.target.value } : x))} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    <option value="">—</option>
                    {units.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="col-span-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => inputs.length > 1 && setInputs((arr) => arr.filter((_, idx) => idx !== i))} className="text-rose-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setInputs((arr) => [...arr, { rawMaterialId: "", qty: 0, unit: "" }])}>
              <Plus className="h-4 w-4" />
              Add input
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteMasterBtn({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <form
      action={async (fd) => {
        if (!confirm("Delete this production process?")) return;
        try { await deleteProductionMaster(fd); toast({ variant: "success", title: "Deleted" }); router.refresh(); }
        catch (e) { toast({ variant: "destructive", title: "Couldn't delete", description: String(e) }); }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" className="text-rose-600">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </form>
  );
}

export function RunBtn({
  masterId,
  name,
  defaultQty,
  outputName,
  outputQty,
  outputUnit,
}: {
  masterId: string;
  name: string;
  defaultQty: number;
  outputName: string;
  outputQty: number;
  outputUnit: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [runQty, setRunQty] = React.useState<number>(defaultQty);
  const [type, setType] = React.useState<"DIRECT" | "AGAINST_PO">("DIRECT");
  const [notes, setNotes] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const submit = () => {
    startTransition(async () => {
      try {
        await executeProductionRun({ masterId, runQty, type, notes: notes || undefined });
        toast({ variant: "success", title: "Run executed", description: `+${outputQty * runQty} ${outputUnit} ${outputName}` });
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't execute", description: String(e) });
      }
    });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Play className="h-3.5 w-3.5" />Execute</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Execute · {name}</DialogTitle>
          <DialogDescription>
            Producing <strong>{outputQty * runQty} {outputUnit}</strong> of {outputName}. Inputs are deducted in proportion.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Run quantity</Label>
            <Input type="number" min="0.1" step="0.1" value={runQty} onChange={(e) => setRunQty(Number(e.target.value) || 1)} />
          </div>
          <div>
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {(["DIRECT", "AGAINST_PO"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setType(t)} className={`text-xs px-2 py-2 rounded border ${type === t ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}>
                  {t.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>{pending ? "Running…" : "Execute"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
