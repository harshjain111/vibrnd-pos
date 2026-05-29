"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Save, Trash2 } from "lucide-react";
import { saveTable, saveTablePositions, deleteTable } from "./actions";

type Shape = "ROUND" | "SQUARE" | "RECT";
type Tbl = {
  id: string;
  name: string;
  area: string;
  capacity: number;
  posX: number;
  posY: number;
  shape: Shape;
};

/**
 * Drag-and-drop floor plan editor (audit TASK 5).
 * Coordinates stored as percentage of canvas so the layout scales with the screen.
 */
export function FloorPlanEditor({ initial }: { initial: Tbl[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [tables, setTables] = React.useState<Tbl[]>(initial);
  const [activeArea, setActiveArea] = React.useState<string>("ALL");
  const [editing, setEditing] = React.useState<Partial<Tbl> | null>(null);
  const [pending, startTransition] = React.useTransition();
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const draggingId = React.useRef<string | null>(null);
  const dragOffset = React.useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [dirty, setDirty] = React.useState(false);

  const areas = React.useMemo(() => {
    const set = new Set(tables.map((t) => t.area));
    return ["ALL", ...[...set].sort()];
  }, [tables]);

  const visible = tables.filter((t) => activeArea === "ALL" || t.area === activeArea);

  // ── Mouse / touch drag handling ────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent, t: Tbl) => {
    if (!canvasRef.current) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    draggingId.current = t.id;
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = rect.left + (t.posX / 100) * rect.width;
    const cy = rect.top + (t.posY / 100) * rect.height;
    dragOffset.current = { dx: e.clientX - cx, dy: e.clientY - cy };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingId.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - dragOffset.current.dx - rect.left;
    const y = e.clientY - dragOffset.current.dy - rect.top;
    const px = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const py = Math.max(0, Math.min(100, (y / rect.height) * 100));
    setTables((prev) => prev.map((t) => (t.id === draggingId.current ? { ...t, posX: px, posY: py } : t)));
    setDirty(true);
  };
  const onPointerUp = () => {
    draggingId.current = null;
  };

  const onCanvasClick = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    if ((e.target as HTMLElement).closest("[data-table]")) return; // ignore clicks on existing tables
    const rect = canvasRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    setEditing({
      name: `T${tables.length + 1}`,
      area: activeArea !== "ALL" ? activeArea : "Main",
      capacity: 4,
      posX: px,
      posY: py,
      shape: "ROUND",
    });
  };

  const savePositions = () => {
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set(
          "positions",
          JSON.stringify(tables.map((t) => ({ id: t.id, posX: t.posX, posY: t.posY })))
        );
        await saveTablePositions(fd);
        setDirty(false);
        toast({ variant: "success", title: "Layout saved" });
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't save layout", description: String(e) });
      }
    });
  };

  const onSaveEdit = async (fd: FormData) => {
    try {
      await saveTable(fd);
      toast({ variant: "success", title: editing?.id ? "Table updated" : "Table added" });
      setEditing(null);
      router.refresh();
    } catch (e) {
      toast({ variant: "destructive", title: "Save failed", description: String(e) });
    }
  };

  const onDelete = (id: string) => {
    if (!confirm("Hide this table from the floor plan? Past orders for it stay intact.")) return;
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      try {
        await deleteTable(fd);
        toast({ variant: "success", title: "Table removed" });
        router.refresh();
      } catch (e) {
        toast({ variant: "destructive", title: "Delete failed", description: String(e) });
      }
    });
  };

  return (
    <div className="space-y-3">
      {/* Area chips + Save layout */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 flex-wrap">
          {areas.map((a) => (
            <button
              key={a}
              onClick={() => setActiveArea(a)}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                activeArea === a ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"
              }`}
            >
              {a === "ALL" ? "All areas" : a}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setEditing({ name: `T${tables.length + 1}`, area: activeArea !== "ALL" ? activeArea : "Main", capacity: 4, posX: 50, posY: 50, shape: "ROUND" })
            }
          >
            <Plus className="h-4 w-4" />
            Add table
          </Button>
          <Button size="sm" disabled={!dirty || pending} onClick={savePositions}>
            <Save className="h-4 w-4" />
            {dirty ? "Save layout" : "Layout saved"}
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        onClick={onCanvasClick}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative w-full aspect-[16/9] rounded-lg border-2 border-dashed bg-[linear-gradient(135deg,_#f1f5f9_25%,_transparent_25%,_transparent_50%,_#f1f5f9_50%,_#f1f5f9_75%,_transparent_75%,_transparent)] bg-[length:24px_24px] cursor-crosshair select-none"
      >
        {visible.map((t) => (
          <button
            key={t.id}
            data-table
            onPointerDown={(e) => onPointerDown(e, t)}
            onClick={(e) => {
              e.stopPropagation();
              if (!draggingId.current) setEditing(t);
            }}
            style={{
              position: "absolute",
              left: `${t.posX}%`,
              top: `${t.posY}%`,
              transform: "translate(-50%, -50%)",
            }}
            className={`flex flex-col items-center justify-center bg-card border-2 border-primary/40 text-foreground shadow hover:border-primary hover:shadow-md transition-all touch-none cursor-grab active:cursor-grabbing ${
              t.shape === "ROUND" ? "h-16 w-16 rounded-full" : t.shape === "SQUARE" ? "h-16 w-16 rounded-md" : "h-14 w-24 rounded-md"
            }`}
            title={`${t.name} · ${t.area} · seats ${t.capacity}`}
          >
            <span className="text-sm font-bold leading-none">{t.name}</span>
            <span className="text-[9px] text-muted-foreground mt-0.5">{t.capacity} pax</span>
          </button>
        ))}
        {visible.length === 0 && (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            Click anywhere to drop a table here.
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        <Badge variant="outline" className="text-[10px] mr-1">Tip</Badge>
        Drag tables to rearrange. Click an empty spot to add. Click a table to edit. <strong>Save layout</strong> persists positions.
      </div>

      {/* Edit / Add dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? `Edit ${editing.name}` : "Add table"}</DialogTitle>
            <DialogDescription>
              Each table belongs to an area like Ground / Terrace / AC. Captains see them grouped by area on the POS.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form action={onSaveEdit} className="space-y-3">
              {editing.id && <input type="hidden" name="id" value={editing.id} />}
              <input type="hidden" name="posX" value={editing.posX ?? 50} />
              <input type="hidden" name="posY" value={editing.posY ?? 50} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Table name</Label>
                  <Input name="name" required defaultValue={editing.name ?? ""} placeholder="T1" />
                </div>
                <div>
                  <Label>Area</Label>
                  <Input name="area" required defaultValue={editing.area ?? "Main"} placeholder="Main / Terrace" />
                </div>
                <div>
                  <Label>Capacity</Label>
                  <Input name="capacity" type="number" min="1" max="50" required defaultValue={editing.capacity ?? 4} />
                </div>
                <div>
                  <Label>Shape</Label>
                  <select name="shape" defaultValue={editing.shape ?? "ROUND"} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                    <option value="ROUND">Round</option>
                    <option value="SQUARE">Square</option>
                    <option value="RECT">Rectangle</option>
                  </select>
                </div>
              </div>
              <DialogFooter className="!justify-between items-center">
                {editing.id ? (
                  <Button type="button" variant="ghost" className="text-rose-600" onClick={() => editing.id && onDelete(editing.id)}>
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                  <Button type="submit">{editing.id ? "Save" : "Add table"}</Button>
                </div>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
