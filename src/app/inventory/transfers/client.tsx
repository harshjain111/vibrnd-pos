"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
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
import { ClipboardList, Plus, Trash2, Truck, ShoppingCart, AlertTriangle } from "lucide-react";
import { createTransfer, receiveTransfer } from "./actions";
import { fulfilRequisition, dispatchRequisitions } from "../requisitions/actions";

/* ── shared types passed from the server page ──────────────────────────── */
export type PendingReqLine = {
  rawMaterialId: string;
  name: string;
  unit: string;
  approved: number;
  available: number;
};
export type PendingReq = {
  id: string;
  reqNo: string;
  requesterDeptId: string;
  requesterDeptName: string;
  lines: PendingReqLine[];
  hasShortfall: boolean;
  canTransfer: boolean;
};
export type StoreItem = { id: string; name: string; unit: string; available: number };

/* ── editable-line state used by both dispatch dialogs ─────────────────── */
type ExtraLine = { key: string; rawMaterialId: string; qty: string };
const newExtra = (): ExtraLine => ({ key: Math.random().toString(36).slice(2), rawMaterialId: "", qty: "" });

function ExtraItemsEditor({
  storeItems,
  excludeIds,
  extras,
  setExtras,
}: {
  storeItems: StoreItem[];
  excludeIds: Set<string>;
  extras: ExtraLine[];
  setExtras: React.Dispatch<React.SetStateAction<ExtraLine[]>>;
}) {
  const byId = React.useMemo(() => new Map(storeItems.map((s) => [s.id, s])), [storeItems]);
  const options = storeItems.filter((s) => !excludeIds.has(s.id) && s.available > 0);
  const update = (key: string, patch: Partial<ExtraLine>) =>
    setExtras((arr) => arr.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  return (
    <div className="space-y-1.5">
      {extras.map((e) => {
        const item = e.rawMaterialId ? byId.get(e.rawMaterialId) : null;
        const over = item && Number(e.qty) > item.available + 0.001;
        return (
          <div key={e.key} className="flex items-end gap-2">
            <select
              value={e.rawMaterialId}
              onChange={(ev) => update(e.key, { rawMaterialId: ev.target.value })}
              className="h-8 flex-1 rounded-md border bg-background px-2 text-xs"
            >
              <option value="">Add an item…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.available} {o.unit})
                </option>
              ))}
              {/* keep the currently-picked item visible even if filtered */}
              {item && excludeIds.has(item.id) && <option value={item.id}>{item.name}</option>}
            </select>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={e.qty}
              onChange={(ev) => update(e.key, { qty: ev.target.value })}
              className={`h-8 w-24 text-right ${over ? "border-rose-500" : ""}`}
              placeholder="qty"
            />
            <span className="text-[10px] text-muted-foreground w-8">{item?.unit ?? ""}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-rose-600"
              onClick={() => setExtras((arr) => arr.filter((x) => x.key !== e.key))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => setExtras((arr) => [...arr, newExtra()])}>
        <Plus className="h-3.5 w-3.5" /> Add extra item
      </Button>
    </div>
  );
}

/* ── 1) Single-requisition transfer dialog (per-line qty + extras) ─────── */
function TransferReqDialog({ req, storeItems }: { req: PendingReq; storeItems: StoreItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [qty, setQty] = React.useState<Record<string, string>>({});
  const [extras, setExtras] = React.useState<ExtraLine[]>([]);

  // Pre-fill each line with min(approved, available).
  React.useEffect(() => {
    if (!open) return;
    setQty(Object.fromEntries(req.lines.map((l) => [l.rawMaterialId, String(Math.max(0, Math.min(l.approved, l.available)))])));
    setExtras([]);
  }, [open, req]);

  const reqRmIds = React.useMemo(() => new Set(req.lines.map((l) => l.rawMaterialId)), [req]);

  const submit = () => {
    const lines = req.lines
      .map((l) => ({ rawMaterialId: l.rawMaterialId, qty: Number(qty[l.rawMaterialId]) || 0 }))
      .filter((l) => l.qty > 0);
    const adhocLines = extras
      .filter((e) => e.rawMaterialId && Number(e.qty) > 0)
      .map((e) => {
        const s = storeItems.find((x) => x.id === e.rawMaterialId)!;
        return { rawMaterialId: e.rawMaterialId, qty: Number(e.qty), unit: s.unit };
      });
    if (lines.length === 0 && adhocLines.length === 0) {
      return toast({ variant: "destructive", title: "Enter a quantity for at least one item" });
    }
    startTransition(async () => {
      const res = await dispatchRequisitions({
        requisitions: lines.length ? [{ requisitionId: req.id, lines }] : [],
        adhoc: adhocLines.length ? { toDepartmentId: req.requesterDeptId, lines: adhocLines } : undefined,
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't transfer", description: res.error });
        return;
      }
      toast({ variant: "success", title: `Transferred ${req.reqNo}`, description: "Department receives it via Raise GRN." });
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!req.canTransfer} title={req.canTransfer ? "Enter quantities to transfer" : "Nothing in store to transfer"}>
          <Truck className="h-4 w-4" />
          Transfer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Transfer {req.reqNo} → {req.requesterDeptName}</DialogTitle>
          <DialogDescription>
            Quantities are pre-filled with what the store can cover. Edit any line, then transfer. The
            department receives it via Raise GRN; this marks the requisition transferred.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-2">Item</th>
                <th className="text-right p-2 w-24">Approved</th>
                <th className="text-right p-2 w-24">In store</th>
                <th className="text-right p-2 w-28">Transfer</th>
              </tr>
            </thead>
            <tbody>
              {req.lines.map((l) => {
                const v = Number(qty[l.rawMaterialId]) || 0;
                const over = v > Math.min(l.approved, l.available) + 0.001;
                return (
                  <tr key={l.rawMaterialId} className="border-t">
                    <td className="p-2 font-medium">{l.name}</td>
                    <td className="p-2 text-right text-muted-foreground tabular-nums">{l.approved} {l.unit}</td>
                    <td className={`p-2 text-right tabular-nums ${l.available < l.approved ? "text-rose-700 font-semibold" : "text-muted-foreground"}`}>
                      {l.available} {l.unit}
                    </td>
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={qty[l.rawMaterialId] ?? ""}
                        onChange={(e) => setQty((q) => ({ ...q, [l.rawMaterialId]: e.target.value }))}
                        className={`h-8 w-24 text-right ml-auto ${over ? "border-rose-500" : ""}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <Label className="text-xs">Extra items (optional) → {req.requesterDeptName}</Label>
          <div className="mt-1">
            <ExtraItemsEditor storeItems={storeItems} excludeIds={reqRmIds} extras={extras} setExtras={setExtras} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={pending}>
            <Truck className="h-4 w-4" />
            {pending ? "Transferring…" : "Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── pending-requisitions section on the transfers page ────────────────── */
export function PendingRequisitions({
  requisitions,
  storeItems,
}: {
  requisitions: PendingReq[];
  storeItems: StoreItem[];
}) {
  if (requisitions.length === 0) {
    return (
      <Card className="mb-4">
        <CardContent>
          <Empty icon={ClipboardList} title="No pending requisitions" desc="Approved requisitions waiting to be dispatched show up here." />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="mb-4 border-sky-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-1.5">
          <ClipboardList className="h-4 w-4 text-sky-700" />
          Pending requisitions ({requisitions.length})
        </CardTitle>
        <CardDescription>
          Approved requests awaiting dispatch. Click Transfer to enter quantities per item; raise a PO for any shortfall.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {requisitions.map((r) => (
          <div key={r.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-sm">
                <span className="font-mono font-medium">{r.reqNo}</span>
                <span className="text-muted-foreground"> · {r.requesterDeptName}</span>
                {r.hasShortfall && (
                  <Badge variant="warning" className="ml-2 text-[9px]">
                    <AlertTriangle className="h-3 w-3" /> short on stock
                  </Badge>
                )}
              </div>
              <div className="flex gap-1.5">
                {r.hasShortfall && (
                  <Button asChild size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50">
                    <Link href={`/inventory/purchase/new?req=${r.id}`}>
                      <ShoppingCart className="h-4 w-4" />
                      Raise PO for shortfall
                    </Link>
                  </Button>
                )}
                <TransferReqDialog req={r} storeItems={storeItems} />
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left font-medium py-1">Item</th>
                  <th className="text-right font-medium py-1 w-28">Approved</th>
                  <th className="text-right font-medium py-1 w-28">In store</th>
                </tr>
              </thead>
              <tbody>
                {r.lines.map((l) => {
                  const short = l.available < l.approved;
                  return (
                    <tr key={l.rawMaterialId} className="border-b last:border-0">
                      <td className="py-1 font-medium">{l.name}</td>
                      <td className="py-1 text-right text-muted-foreground tabular-nums">{l.approved} {l.unit}</td>
                      <td className={`py-1 text-right tabular-nums ${short ? "text-rose-700 font-semibold" : "text-muted-foreground"}`}>
                        {l.available} {l.unit}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ── 2) Combined multi-requisition transfer dialog ─────────────────────── */
export function CombinedTransferDialog({
  children,
  requisitions,
  storeItems,
  departments,
}: {
  children: React.ReactNode;
  requisitions: PendingReq[];
  storeItems: StoreItem[];
  departments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  // qty keyed by `${reqId}:${rawMaterialId}`
  const [qty, setQty] = React.useState<Record<string, string>>({});
  const [extras, setExtras] = React.useState<ExtraLine[]>([]);
  const [extraDeptId, setExtraDeptId] = React.useState<string>(departments[0]?.id ?? "");

  const reset = () => {
    setPicked(new Set());
    setQty({});
    setExtras([]);
  };

  const toggle = (req: PendingReq) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(req.id)) {
        next.delete(req.id);
      } else {
        next.add(req.id);
        // pre-fill its lines
        setQty((q) => {
          const nq = { ...q };
          for (const l of req.lines) nq[`${req.id}:${l.rawMaterialId}`] = String(Math.max(0, Math.min(l.approved, l.available)));
          return nq;
        });
      }
      return next;
    });

  const pickedReqs = requisitions.filter((r) => picked.has(r.id));

  const submit = () => {
    const reqPayload = pickedReqs
      .map((r) => ({
        requisitionId: r.id,
        lines: r.lines
          .map((l) => ({ rawMaterialId: l.rawMaterialId, qty: Number(qty[`${r.id}:${l.rawMaterialId}`]) || 0 }))
          .filter((l) => l.qty > 0),
      }))
      .filter((r) => r.lines.length > 0);
    const adhocLines = extras
      .filter((e) => e.rawMaterialId && Number(e.qty) > 0)
      .map((e) => {
        const s = storeItems.find((x) => x.id === e.rawMaterialId)!;
        return { rawMaterialId: e.rawMaterialId, qty: Number(e.qty), unit: s.unit };
      });
    if (reqPayload.length === 0 && adhocLines.length === 0) {
      return toast({ variant: "destructive", title: "Select at least one requisition (or add an item)" });
    }
    if (adhocLines.length > 0 && !extraDeptId) {
      return toast({ variant: "destructive", title: "Pick a department for the extra items" });
    }
    startTransition(async () => {
      const res = await dispatchRequisitions({
        requisitions: reqPayload,
        adhoc: adhocLines.length ? { toDepartmentId: extraDeptId, lines: adhocLines } : undefined,
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't transfer", description: res.error });
        return;
      }
      toast({ variant: "success", title: "Transfer dispatched", description: `${reqPayload.length} requisition(s) marked transferred.` });
      setOpen(false);
      reset();
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New transfer — combine requisitions</DialogTitle>
          <DialogDescription>
            Tick the requisitions to fulfil. Their items load with editable quantities; reduce or add
            extra items as needed. Each selected requisition is dispatched and marked transferred.
          </DialogDescription>
        </DialogHeader>

        {requisitions.length === 0 ? (
          <Empty icon={ClipboardList} title="No approved requisitions" desc="Approve a requisition first, then combine and transfer here." />
        ) : (
          <div className="space-y-3">
            {requisitions.map((r) => {
              const isPicked = picked.has(r.id);
              return (
                <div key={r.id} className={`rounded-md border ${isPicked ? "border-sky-300 bg-sky-50/30" : ""}`}>
                  <label className="flex items-center gap-2 p-2 cursor-pointer">
                    <input type="checkbox" checked={isPicked} onChange={() => toggle(r)} className="h-4 w-4" />
                    <span className="font-mono text-xs font-medium">{r.reqNo}</span>
                    <span className="text-xs text-muted-foreground">· {r.requesterDeptName} · {r.lines.length} item(s)</span>
                    {r.hasShortfall && <Badge variant="warning" className="text-[9px] ml-auto"><AlertTriangle className="h-3 w-3" /> short</Badge>}
                  </label>
                  {isPicked && (
                    <table className="w-full text-sm border-t">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="text-left p-2">Item</th>
                          <th className="text-right p-2 w-24">Approved</th>
                          <th className="text-right p-2 w-24">In store</th>
                          <th className="text-right p-2 w-28">Transfer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.lines.map((l) => {
                          const k = `${r.id}:${l.rawMaterialId}`;
                          const v = Number(qty[k]) || 0;
                          const over = v > Math.min(l.approved, l.available) + 0.001;
                          return (
                            <tr key={l.rawMaterialId} className="border-t">
                              <td className="p-2">{l.name}</td>
                              <td className="p-2 text-right text-muted-foreground tabular-nums">{l.approved} {l.unit}</td>
                              <td className={`p-2 text-right tabular-nums ${l.available < l.approved ? "text-rose-700" : "text-muted-foreground"}`}>{l.available} {l.unit}</td>
                              <td className="p-2 text-right">
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={qty[k] ?? ""}
                                  onChange={(e) => setQty((q) => ({ ...q, [k]: e.target.value }))}
                                  className={`h-8 w-24 text-right ml-auto ${over ? "border-rose-500" : ""}`}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}

            {/* extra items */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Extra items (not on a requisition)</Label>
                {departments.length > 0 && (
                  <select
                    value={extraDeptId}
                    onChange={(e) => setExtraDeptId(e.target.value)}
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>to {d.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <ExtraItemsEditor storeItems={storeItems} excludeIds={new Set()} extras={extras} setExtras={setExtras} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={pending || requisitions.length === 0}>
            <Truck className="h-4 w-4" />
            {pending ? "Transferring…" : `Transfer ${pickedReqs.length || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── chain / ad-hoc cross-outlet transfer (unchanged behaviour) ────────── */
type Outlet = { id: string; name: string };
type RM = { id: string; name: string; unit: string; price: number };
type Line = { rawMaterialId: string; qty: number; unit: string; priceAtTransfer: number };

export type ReqOption = {
  id: string;
  reqNo: string;
  kind: "INTERNAL" | "CHAIN";
  requesterOutletId: string;
  requesterOutletName: string;
  requesterDeptName: string;
  lines: { rawMaterialId: string; rawMaterialName: string; qty: number; unit: string }[];
};

export function NewTransferDialog({
  children,
  outlets,
  rawMaterials,
  units,
  requisitions,
}: {
  children: React.ReactNode;
  outlets: Outlet[];
  rawMaterials: RM[];
  units: string[];
  requisitions?: ReqOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pickedReqId, setPickedReqId] = React.useState<string>("");
  const [receiverOutletId, setReceiverOutletId] = React.useState<string>(outlets[0]?.id ?? "");
  const [challanNo, setChallanNo] = React.useState("");
  const [transferDate, setTransferDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([{ rawMaterialId: "", qty: 0, unit: "", priceAtTransfer: 0 }]);
  const [pending, startTransition] = React.useTransition();

  const rmMap = React.useMemo(() => new Map(rawMaterials.map((r) => [r.id, r])), [rawMaterials]);
  const reqById = React.useMemo(() => new Map((requisitions ?? []).map((r) => [r.id, r])), [requisitions]);
  const pickedReq = pickedReqId ? reqById.get(pickedReqId) : null;
  const fromReq = !!pickedReq;

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const onSelectRm = (i: number, id: string) => {
    const rm = rmMap.get(id);
    updateLine(i, { rawMaterialId: id, unit: rm?.unit ?? "", priceAtTransfer: rm?.price ?? 0 });
  };
  const addLine = () => setLines((arr) => [...arr, { rawMaterialId: "", qty: 0, unit: "", priceAtTransfer: 0 }]);
  const removeLine = (i: number) => setLines((arr) => (arr.length === 1 ? arr : arr.filter((_, idx) => idx !== i)));

  React.useEffect(() => {
    if (!pickedReq) return;
    setLines(pickedReq.lines.map((l) => ({ rawMaterialId: l.rawMaterialId, qty: l.qty, unit: l.unit, priceAtTransfer: 0 })));
    setReceiverOutletId(pickedReq.requesterOutletId);
    setChallanNo(`${pickedReq.reqNo}-T`);
  }, [pickedReq]);

  const resetForm = () => {
    setPickedReqId("");
    setLines([{ rawMaterialId: "", qty: 0, unit: "", priceAtTransfer: 0 }]);
    setChallanNo("");
    setNotes("");
  };

  const submit = () => {
    if (pickedReq) {
      const fd = new FormData();
      fd.set("id", pickedReq.id);
      startTransition(async () => {
        const res = await fulfilRequisition(fd);
        if (!res.ok) {
          toast({ variant: "destructive", title: "Couldn't transfer", description: res.error });
          return;
        }
        toast({ variant: "success", title: `Transferred against ${pickedReq.reqNo}` });
        setOpen(false);
        resetForm();
        router.refresh();
      });
      return;
    }
    if (!receiverOutletId) return toast({ variant: "destructive", title: "Pick a receiving outlet" });
    if (lines.some((l) => !l.rawMaterialId || l.qty <= 0)) {
      return toast({ variant: "destructive", title: "Each line needs an RM and qty > 0" });
    }
    startTransition(async () => {
      try {
        await createTransfer({
          receiverOutletId,
          challanNo: challanNo || undefined,
          transferDate,
          notes: notes || undefined,
          lines: lines.map((l) => ({ rawMaterialId: l.rawMaterialId, qty: l.qty, unit: l.unit, priceAtTransfer: l.priceAtTransfer })),
        });
        toast({ variant: "success", title: "Transfer sent" });
        setOpen(false);
        resetForm();
        router.refresh();
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't send", description: String(e) });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send to another outlet</DialogTitle>
          <DialogDescription>
            Fulfil a chain requisition or send raw materials ad-hoc to another outlet. Sender stock decrements on save.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {requisitions && requisitions.length > 0 && (
            <div className="rounded-md border-2 border-sky-200 bg-sky-50/40 p-3 space-y-2">
              <Label className="flex items-center gap-1.5 text-sky-900">
                <ClipboardList className="h-3.5 w-3.5" />
                From chain requisition (optional)
              </Label>
              <select value={pickedReqId} onChange={(e) => setPickedReqId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                <option value="">— Ad-hoc transfer (no requisition) —</option>
                {requisitions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.reqNo} · {r.requesterDeptName} @ {r.requesterOutletName} · {r.lines.length} item(s)
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>To outlet</Label>
              {fromReq ? (
                <div className="h-9 rounded-md border bg-muted/50 px-3 flex items-center text-sm">{pickedReq.requesterOutletName}</div>
              ) : (
                <select value={receiverOutletId} onChange={(e) => setReceiverOutletId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                  {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              )}
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} disabled={fromReq} />
            </div>
            <div>
              <Label>Challan #</Label>
              <Input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} placeholder="auto" disabled={fromReq} />
            </div>
          </div>
          {!fromReq && (
            <div>
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
            </div>
          )}
          <div className="border rounded-md p-2 space-y-2">
            {fromReq ? (
              <ul className="divide-y text-sm">
                {pickedReq.lines.map((l, i) => (
                  <li key={i} className="py-1.5 flex items-center justify-between gap-2">
                    <span className="font-medium">{l.rawMaterialName}</span>
                    <span className="tabular-nums text-muted-foreground">{l.qty} {l.unit}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <Label className="text-xs">Raw material</Label>
                      <select value={l.rawMaterialId} onChange={(e) => onSelectRm(i, e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                        <option value="">—</option>
                        {rawMaterials.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Qty</Label>
                      <Input type="number" step="0.01" value={l.qty} onChange={(e) => updateLine(i, { qty: Number(e.target.value) || 0 })} className="h-9" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Unit</Label>
                      <select value={l.unit} onChange={(e) => updateLine(i, { unit: e.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                        <option value="">—</option>
                        {units.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Price ₹</Label>
                      <Input type="number" step="0.01" value={l.priceAtTransfer} onChange={(e) => updateLine(i, { priceAtTransfer: Number(e.target.value) || 0 })} className="h-9" />
                    </div>
                    <div className="col-span-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(i)} className="text-rose-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="h-4 w-4" /> Add line
                </Button>
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>{pending ? "Sending…" : fromReq ? `Fulfil ${pickedReq.reqNo}` : "Send"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReceiveBtn({
  transferId,
  lines,
}: {
  transferId: string;
  lines: { id: string; name: string; qtySent: number; unit: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [received, setReceived] = React.useState<Record<string, number>>(
    Object.fromEntries(lines.map((l) => [l.id, l.qtySent]))
  );
  const [pending, startTransition] = React.useTransition();
  const submit = () => {
    startTransition(async () => {
      try {
        await receiveTransfer({ transferId, lines: lines.map((l) => ({ id: l.id, qtyReceived: received[l.id] ?? 0 })) });
        toast({ variant: "success", title: "Transfer received" });
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't receive", description: String(e) });
      }
    });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Receive</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive transfer</DialogTitle>
          <DialogDescription>Confirm the actual received quantity per line — variances are logged.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
              <div className="text-sm">
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-muted-foreground">Sent: {l.qtySent} {l.unit}</div>
              </div>
              <Input
                type="number"
                step="0.01"
                value={received[l.id] ?? 0}
                onChange={(e) => setReceived((r) => ({ ...r, [l.id]: Number(e.target.value) || 0 }))}
                className="h-8 w-24 text-right"
              />
              <span className="text-xs text-muted-foreground">{l.unit}</span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>{pending ? "Receiving…" : "Confirm receipt"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
