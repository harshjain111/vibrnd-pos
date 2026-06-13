"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { inr } from "@/lib/utils";
import { AlertTriangle, Pencil, Plus, Save, Send, Trash2 } from "lucide-react";
import { createPO, updatePO } from "../actions";

type RateCardRow = {
  rawMaterialId: string;
  negotiatedRate: number;
  isPrimary: boolean;
};
type Supplier = {
  id: string;
  name: string;
  creditDays: number;
  rateCard: RateCardRow[];
};
type Rm = {
  id: string;
  name: string;
  unit: string;
  avgCost: number;
  parLevel: number;
  currentQty: number;
};
type Line = {
  rawMaterialId: string;
  qty: number;
  unit: string;
  unitPrice: number;
  /** Item wasn't on this supplier's rate card when added. */
  offCard?: boolean;
  /** Original rate-card rate at the moment the user overrode it. */
  rateChangedFrom?: number;
  /** Required when offCard=true OR rateChangedFrom is set. */
  rateChangeReason?: string;
};

export function PoBuilder({
  suppliers,
  rms,
  initialSupplierId,
  initialNotes,
  initialLines,
  requisitionId,
  editingPoId,
  editingPoNo,
}: {
  suppliers: Supplier[];
  rms: Rm[];
  initialSupplierId?: string;
  initialNotes?: string;
  initialLines?: { rawMaterialId: string; qty: number; unit: string; unitPrice: number }[];
  requisitionId?: string | null;
  editingPoId?: string | null;
  editingPoNo?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const editing = !!editingPoId;

  const [supplierId, setSupplierId] = React.useState<string>(
    initialSupplierId ?? suppliers[0]?.id ?? ""
  );
  const [notes, setNotes] = React.useState(
    initialNotes ?? (requisitionId ? "Covering shortfall against requisition" : "")
  );
  const [lines, setLines] = React.useState<Line[]>(initialLines ?? []);
  const [pending, startTransition] = React.useTransition();
  const [pendingMode, setPendingMode] = React.useState<"draft" | "submit" | null>(null);

  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const rmById = React.useMemo(() => new Map(rms.map((r) => [r.id, r])), [rms]);

  /** Current supplier's rate card as a quick lookup. */
  const rateMap = React.useMemo(() => {
    const m = new Map<string, RateCardRow>();
    for (const r of supplier?.rateCard ?? []) m.set(r.rawMaterialId, r);
    return m;
  }, [supplier]);

  /** Items the SM can pick straight from the dropdown — supplier's card. */
  const cardItems = React.useMemo(() => {
    if (!supplier) return [] as Rm[];
    return supplier.rateCard
      .map((r) => rmById.get(r.rawMaterialId))
      .filter(Boolean) as Rm[];
  }, [supplier, rmById]);

  /** Items the SM can add via "Add other item" — every RM NOT on the card. */
  const offCardItems = React.useMemo(() => {
    if (!supplier) return rms;
    return rms.filter((r) => !rateMap.has(r.id));
  }, [supplier, rms, rateMap]);

  /* ── Dialogs ─────────────────────────────────────────────────────── */
  // Edit-rate dialog state.
  const [editRateFor, setEditRateFor] = React.useState<number | null>(null);
  const [editRateNew, setEditRateNew] = React.useState("");
  const [editRateReason, setEditRateReason] = React.useState("");

  // Add-other-item dialog state.
  const [addOtherOpen, setAddOtherOpen] = React.useState(false);
  const [addOtherSearch, setAddOtherSearch] = React.useState("");
  const [addOtherPick, setAddOtherPick] = React.useState<Rm | null>(null);
  const [addOtherPrice, setAddOtherPrice] = React.useState("");
  const [addOtherReason, setAddOtherReason] = React.useState("");

  /* ── Line ops ────────────────────────────────────────────────────── */
  const upd = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  /** "On-card" add — appends a row with the card rate. */
  const addCardLine = (rmId: string) => {
    const rm = rmById.get(rmId);
    const card = rateMap.get(rmId);
    if (!rm || !card) return;
    setLines((ls) => [
      ...ls,
      {
        rawMaterialId: rmId,
        qty: 1,
        unit: rm.unit,
        unitPrice: card.negotiatedRate,
      },
    ]);
  };

  /** Open the rate-edit dialog for a line. Card rate becomes the comparison
   *  point; the dialog prompts for new rate + a reason and stamps both. */
  const openRateEditor = (i: number) => {
    setEditRateFor(i);
    setEditRateNew(String(lines[i].unitPrice));
    setEditRateReason(lines[i].rateChangeReason ?? "");
  };
  const closeRateEditor = () => {
    setEditRateFor(null);
    setEditRateNew("");
    setEditRateReason("");
  };
  const confirmRateEdit = () => {
    if (editRateFor === null) return;
    const newRate = Number(editRateNew);
    if (!Number.isFinite(newRate) || newRate < 0) {
      toast({ variant: "destructive", title: "Enter a valid rate" });
      return;
    }
    const l = lines[editRateFor];
    const card = rateMap.get(l.rawMaterialId);
    // If the new rate equals the card rate, drop the override + reason.
    if (card && Math.abs(card.negotiatedRate - newRate) < 0.001) {
      upd(editRateFor, {
        unitPrice: newRate,
        rateChangedFrom: undefined,
        rateChangeReason: undefined,
      });
    } else {
      if (editRateReason.trim().length < 3) {
        toast({
          variant: "destructive",
          title: "Reason required",
          description: "Explain why the vendor's rate differs from the card.",
        });
        return;
      }
      upd(editRateFor, {
        unitPrice: newRate,
        rateChangedFrom: card?.negotiatedRate ?? l.rateChangedFrom,
        rateChangeReason: editRateReason.trim(),
      });
    }
    closeRateEditor();
  };

  /** Reset the off-card dialog. */
  const closeAddOther = () => {
    setAddOtherOpen(false);
    setAddOtherPick(null);
    setAddOtherSearch("");
    setAddOtherPrice("");
    setAddOtherReason("");
  };
  const confirmAddOther = () => {
    if (!addOtherPick) {
      toast({ variant: "destructive", title: "Pick an item first" });
      return;
    }
    const price = Number(addOtherPrice);
    if (!Number.isFinite(price) || price < 0) {
      toast({ variant: "destructive", title: "Enter a valid unit price" });
      return;
    }
    if (addOtherReason.trim().length < 3) {
      toast({
        variant: "destructive",
        title: "Reason required",
        description: "Off-card items are flagged to the manager — explain why this one.",
      });
      return;
    }
    setLines((ls) => [
      ...ls,
      {
        rawMaterialId: addOtherPick.id,
        qty: 1,
        unit: addOtherPick.unit,
        unitPrice: price,
        offCard: true,
        rateChangeReason: addOtherReason.trim(),
      },
    ]);
    closeAddOther();
  };

  // Suggestions chips (par-level shortfalls) — only show card items.
  const suggestions = React.useMemo(() => {
    return cardItems
      .filter((r) => r.currentQty < r.parLevel && r.parLevel > 0)
      .filter((r) => !lines.some((l) => l.rawMaterialId === r.id))
      .slice(0, 6);
  }, [cardItems, lines]);

  const total = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const offCardCount = lines.filter((l) => l.offCard).length;
  const rateChangedCount = lines.filter(
    (l) => !l.offCard && l.rateChangedFrom !== undefined
  ).length;

  const submit = (mode: "draft" | "submit") => {
    if (!supplierId) {
      toast({ variant: "destructive", title: "Pick a supplier first" });
      return;
    }
    if (lines.length === 0) {
      toast({ variant: "destructive", title: "Add at least one line" });
      return;
    }
    // Re-check the rate-change reason guard so nothing slips through.
    for (const l of lines) {
      if ((l.offCard || l.rateChangedFrom !== undefined) && !l.rateChangeReason) {
        toast({
          variant: "destructive",
          title: "Reason missing",
          description: `Reopen the rate edit on this line and add a reason.`,
        });
        return;
      }
    }

    setPendingMode(mode);
    startTransition(async () => {
      try {
        const submitForApproval = mode === "submit";
        const linesPayload = lines.map((l) => ({
          rawMaterialId: l.rawMaterialId,
          qty: l.qty,
          unit: l.unit,
          unitPrice: l.unitPrice,
          offCard: l.offCard ?? false,
          rateChangedFrom: l.rateChangedFrom,
          rateChangeReason: l.rateChangeReason,
        }));
        const res = editing
          ? await updatePO({
              id: editingPoId!,
              supplierId,
              notes: notes || undefined,
              lines: linesPayload,
              submitForApproval,
            })
          : await createPO({
              supplierId,
              notes: notes || undefined,
              lines: linesPayload,
              requisitionId: requisitionId ?? undefined,
              submitForApproval,
            });
        toast({
          variant: "success",
          title: editing ? `Updated ${res.poNo}` : `Created ${res.poNo}`,
          description: `Status: ${res.status}`,
        });
        router.push(`/inventory/purchase/${res.id}`);
      } catch (e) {
        toast({
          variant: "destructive",
          title: editing ? "Failed to update PO" : "Failed to create PO",
          description: String(e),
        });
      } finally {
        setPendingMode(null);
      }
    });
  };

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Supplier</Label>
                <select
                  value={supplierId}
                  onChange={(e) => {
                    const next = e.target.value;
                    // Switching suppliers wipes lines — the new card likely
                    // doesn't carry the same items / rates, and silently
                    // keeping mismatched lines would be a leakage vector.
                    if (lines.length > 0 && supplierId !== next) {
                      const ok = window.confirm(
                        "Changing supplier will clear the current lines (they may not be on the new vendor's rate card). Continue?"
                      );
                      if (!ok) return;
                      setLines([]);
                    }
                    setSupplierId(next);
                  }}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.rateCard.length === 0 ? " (no rate card)" : ""}
                    </option>
                  ))}
                </select>
                {supplier && (
                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-[9px]">
                      {supplier.rateCard.length} card item(s)
                    </Badge>
                    <Badge variant="secondary" className="text-[9px]">
                      {supplier.creditDays > 0
                        ? `${supplier.creditDays}d credit`
                        : "COD"}
                    </Badge>
                    {supplier.rateCard.length === 0 && (
                      <span className="text-amber-700">
                        No rate card yet — every line will be off-card.
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Delivery instructions, payment terms…"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {suggestions.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Auto-suggest — items below par level (from rate card)
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => addCardLine(r.id)}
                    className="text-xs rounded-full border border-primary/40 text-primary px-3 py-1 hover:bg-primary/10"
                  >
                    + {r.name}{" "}
                    <span className="text-muted-foreground">
                      ({r.currentQty.toFixed(1)} / par {r.parLevel} {r.unit})
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Lines</div>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setAddOtherOpen(true)}
                  title="Add an item that isn't on this vendor's rate card"
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                  Add other item
                </Button>
              </div>
            </div>

            {/* Inline picker for on-card items */}
            {supplier && cardItems.length > 0 ? (
              <div>
                <Label className="text-xs">Add from rate card</Label>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addCardLine(e.target.value);
                    e.currentTarget.value = "";
                  }}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Pick a rate-card item…</option>
                  {cardItems
                    .filter((r) => !lines.some((l) => l.rawMaterialId === r.id))
                    .map((r) => {
                      const card = rateMap.get(r.id)!;
                      return (
                        <option key={r.id} value={r.id}>
                          {r.name} — ₹{card.negotiatedRate}/{r.unit}
                          {card.isPrimary ? " · primary" : ""}
                        </option>
                      );
                    })}
                </select>
              </div>
            ) : supplier && cardItems.length === 0 ? (
              <div className="rounded-md border border-amber-300 bg-amber-50/40 p-2 text-xs flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-700 mt-0.5 shrink-0" />
                <span className="text-amber-900">
                  No rate card for this supplier. Use{" "}
                  <strong>Add other item</strong> and the manager will be
                  alerted, or build a rate card first.
                </span>
              </div>
            ) : null}

            {lines.length === 0 ? (
              <div className="text-sm text-muted-foreground border-2 border-dashed rounded-md py-6 text-center">
                No lines yet. Pick a rate-card item above.
              </div>
            ) : (
              <div className="space-y-1.5">
                {lines.map((l, i) => {
                  const rm = rmById.get(l.rawMaterialId);
                  const card = rateMap.get(l.rawMaterialId);
                  const rateChanged = l.rateChangedFrom !== undefined;
                  const offCard = !!l.offCard;
                  return (
                    <div
                      key={i}
                      className={`rounded-md border p-2 grid grid-cols-[1fr_80px_100px_140px_auto] gap-2 items-center ${
                        offCard
                          ? "border-amber-300 bg-amber-50/40"
                          : rateChanged
                            ? "border-sky-300 bg-sky-50/40"
                            : ""
                      }`}
                    >
                      <div className="text-sm min-w-0">
                        <div className="font-medium truncate">{rm?.name ?? "—"}</div>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          {offCard && (
                            <Badge variant="warning" className="text-[9px]">
                              off-card
                            </Badge>
                          )}
                          {rateChanged && !offCard && (
                            <Badge variant="info" className="text-[9px]">
                              rate edited ₹{l.rateChangedFrom} → ₹{l.unitPrice}
                            </Badge>
                          )}
                          {l.rateChangeReason && (
                            <span
                              className="text-[10px] text-muted-foreground italic truncate"
                              title={l.rateChangeReason}
                            >
                              · {l.rateChangeReason}
                            </span>
                          )}
                        </div>
                      </div>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.qty}
                        onChange={(e) =>
                          upd(i, { qty: Number(e.target.value) || 0 })
                        }
                        className="h-8 text-right"
                      />
                      <div className="text-xs text-muted-foreground text-center">
                        {l.unit}
                      </div>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          ₹
                        </span>
                        <Input
                          readOnly
                          value={l.unitPrice}
                          className="pl-6 h-8 bg-muted/30 cursor-pointer"
                          onClick={() => openRateEditor(i)}
                          title="Click to edit (requires reason)"
                        />
                        <button
                          type="button"
                          onClick={() => openRateEditor(i)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          title="Edit rate"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(i)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-20 self-start">
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-medium">Summary</div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Lines</span>
            <span>{lines.length}</span>
          </div>
          {(offCardCount > 0 || rateChangedCount > 0) && (
            <div className="rounded-md border border-amber-300 bg-amber-50/50 p-2 text-[11px] text-amber-900 space-y-0.5">
              {offCardCount > 0 && (
                <div>
                  <strong>{offCardCount}</strong> off-card line
                  {offCardCount === 1 ? "" : "s"}
                </div>
              )}
              {rateChangedCount > 0 && (
                <div>
                  <strong>{rateChangedCount}</strong> rate-edited line
                  {rateChangedCount === 1 ? "" : "s"}
                </div>
              )}
              <div className="opacity-80">Manager gets a notification on save.</div>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{inr(total)}</span>
          </div>
          <div className="flex items-center justify-between text-base font-semibold pt-2 border-t">
            <span>Grand total</span>
            <span>{inr(total)}</span>
          </div>
          <div className="space-y-2 pt-1">
            <Button
              onClick={() => submit("submit")}
              disabled={lines.length === 0 || pending}
              className="w-full"
              size="lg"
            >
              <Send className="h-4 w-4" />
              {pending && pendingMode === "submit"
                ? "Submitting…"
                : editing
                  ? "Save + submit for approval"
                  : "Submit for approval"}
            </Button>
            <Button
              onClick={() => submit("draft")}
              disabled={lines.length === 0 || pending}
              variant="outline"
              className="w-full"
              size="lg"
            >
              <Save className="h-4 w-4" />
              {pending && pendingMode === "draft" ? "Saving…" : "Save as draft"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Drafts can be revised anytime. Submit kicks off the cost-control
            approval flow. Stock changes only when goods land via a GRN.
          </p>
          {editing && editingPoNo && (
            <p className="text-[11px] text-muted-foreground border-t pt-2">
              Editing draft <span className="font-mono">{editingPoNo}</span>.
              Lines will be replaced wholesale on save.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Edit-rate dialog ─────────────────────────────────────────── */}
      <Dialog open={editRateFor !== null} onOpenChange={(o) => !o && closeRateEditor()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit unit rate</DialogTitle>
            <DialogDescription>
              The vendor's invoice price differs from the rate card. Tell us why —
              the manager gets pinged so big rate moves don't slip past silently.
            </DialogDescription>
          </DialogHeader>
          {editRateFor !== null && (() => {
            const l = lines[editRateFor];
            const rm = rmById.get(l.rawMaterialId);
            const card = rateMap.get(l.rawMaterialId);
            return (
              <div className="space-y-3 text-sm">
                <div className="rounded-md border bg-muted/30 p-2">
                  <div className="font-medium">{rm?.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Rate card:{" "}
                    {card ? (
                      <strong>₹{card.negotiatedRate}/{rm?.unit}</strong>
                    ) : (
                      <em>off-card</em>
                    )}
                  </div>
                </div>
                <div>
                  <Label>New rate ₹ / unit</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editRateNew}
                    onChange={(e) => setEditRateNew(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Reason</Label>
                  <Input
                    value={editRateReason}
                    onChange={(e) => setEditRateReason(e.target.value)}
                    placeholder="e.g. seasonal price hike, one-off mark-up for premium grade"
                  />
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={closeRateEditor}>
              Cancel
            </Button>
            <Button onClick={confirmRateEdit}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add-other-item dialog ────────────────────────────────────── */}
      <Dialog open={addOtherOpen} onOpenChange={(o) => (o ? null : closeAddOther())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add item that isn't on the rate card</DialogTitle>
            <DialogDescription>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 border border-amber-300 px-2 py-1 text-amber-900 text-xs">
                <AlertTriangle className="h-3.5 w-3.5" />
                This item isn't saved in this vendor's rate card.
              </span>{" "}
              Manager gets a notification when the PO is saved with off-card
              lines.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <Input
              placeholder="Search items…"
              value={addOtherSearch}
              onChange={(e) => setAddOtherSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-48 overflow-y-auto rounded-md border">
              {offCardItems
                .filter((r) =>
                  r.name.toLowerCase().includes(addOtherSearch.toLowerCase())
                )
                .slice(0, 100)
                .map((r) => {
                  const picked = addOtherPick?.id === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setAddOtherPick(r);
                        setAddOtherPrice(String(r.avgCost || 0));
                      }}
                      className={`w-full text-left p-2 border-b last:border-0 hover:bg-accent ${
                        picked ? "bg-primary/10" : ""
                      }`}
                    >
                      <div className="font-medium text-sm">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.unit} · avg cost ₹{r.avgCost.toFixed(2)}
                      </div>
                    </button>
                  );
                })}
              {offCardItems.length === 0 && (
                <div className="p-3 text-sm text-muted-foreground text-center">
                  Every item is already on this supplier's rate card 🎉
                </div>
              )}
            </div>

            {addOtherPick && (
              <>
                <div className="rounded-md border bg-amber-50/40 border-amber-300 p-2 text-xs text-amber-900">
                  Adding <strong>{addOtherPick.name}</strong> as an off-card
                  line. Manager will be alerted on save.
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Unit price ₹</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={addOtherPrice}
                      onChange={(e) => setAddOtherPrice(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Reason</Label>
                    <Input
                      value={addOtherReason}
                      onChange={(e) => setAddOtherReason(e.target.value)}
                      placeholder="e.g. one-off ingredient for special menu"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAddOther}>
              Cancel
            </Button>
            <Button onClick={confirmAddOther} disabled={!addOtherPick}>
              Add off-card line
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
