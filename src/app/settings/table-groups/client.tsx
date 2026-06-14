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
import { Trash2, Check } from "lucide-react";
import { saveTableGroup, deleteTableGroup } from "./actions";

type Captain = { id: string; name: string };
type Table = { id: string; name: string; currentGroupId: string | null };
type Init = { id: string; name: string; captainId: string; tableIds: string[] };

export function TableGroupDialog({
  children,
  captains,
  tables,
  initial,
}: {
  children: React.ReactNode;
  captains: Captain[];
  tables: Table[];
  initial?: Init;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(initial?.name ?? "");
  const [captainId, setCaptainId] = React.useState(initial?.captainId ?? "");
  const [picked, setPicked] = React.useState<Set<string>>(new Set(initial?.tableIds ?? []));
  const [pending, startTransition] = React.useTransition();

  // Reset state when the dialog opens with different initial data.
  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setCaptainId(initial?.captainId ?? "");
      setPicked(new Set(initial?.tableIds ?? []));
    }
  }, [open, initial]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const submit = () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Name is required" });
      return;
    }
    startTransition(async () => {
      try {
        await saveTableGroup({
          id: initial?.id,
          name: name.trim(),
          captainId: captainId || undefined,
          tableIds: [...picked],
        });
        toast({
          variant: "success",
          title: initial?.id ? `Updated "${name.trim()}"` : `Created "${name.trim()}"`,
          description: `${picked.size} table${picked.size === 1 ? "" : "s"} assigned${captainId ? ` to ${captains.find((c) => c.id === captainId)?.name}` : ""}.`,
        });
        setOpen(false);
        router.refresh();
      } catch (e: any) {
        toast({ variant: "destructive", title: "Save failed", description: String(e?.message ?? e) });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit table group" : "New table group"}</DialogTitle>
          <DialogDescription>
            Pick the captain who owns this section + the tables that belong to it. Tables already
            assigned to another group are shown disabled — edit that group first if you want to move them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Group name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Patio, VIP room, Bar lounge"
                autoFocus
              />
            </div>
            <div>
              <Label>Captain</Label>
              <select
                value={captainId}
                onChange={(e) => setCaptainId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">— No captain —</option>
                {captains.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label>Tables in this group</Label>
              <span className="text-xs text-muted-foreground">{picked.size} picked</span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 p-2 border rounded-md bg-muted/30 max-h-72 overflow-y-auto">
              {tables.map((t) => {
                const checked = picked.has(t.id);
                // Lock a table that's already in some OTHER group — picking
                // it here would silently steal it; force the user to edit
                // the owning group first.
                const lockedByOther = !!t.currentGroupId && t.currentGroupId !== initial?.id && !checked;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => !lockedByOther && toggle(t.id)}
                    disabled={lockedByOther}
                    className={
                      "rounded-md border px-2 py-1.5 text-xs transition-colors text-left " +
                      (checked
                        ? "bg-primary/10 border-primary text-primary font-medium"
                        : lockedByOther
                        ? "bg-muted/40 border-input text-muted-foreground/50 cursor-not-allowed line-through"
                        : "bg-background border-input hover:bg-accent")
                    }
                    title={lockedByOther ? "In another group" : undefined}
                  >
                    <span className="flex items-center gap-1">
                      {checked && <Check className="h-3 w-3 shrink-0" />}
                      <span className="truncate">{t.name}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : initial?.id ? "Save changes" : "Create group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteTableGroupBtn({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();

  const submit = () => {
    if (!confirm(`Delete "${name}"? Assigned tables will be left ungrouped.`)) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      await deleteTableGroup(fd);
      toast({ variant: "success", title: `Deleted ${name}` });
      router.refresh();
    });
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={submit}
      disabled={pending}
      className="h-8 w-8 text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
