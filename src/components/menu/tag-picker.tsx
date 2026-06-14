"use client";
/**
 * Multi-select picker for menu-item tags with inline "Create new tag".
 *
 * Used inside the menu item editor. Renders all available tags as toggle
 * chips, plus a "+ New tag" button that opens a mini-form (name + icon +
 * color). When a new tag is saved we splice it into the local list and
 * auto-select it so the user doesn't have to re-find it.
 *
 * The selected ids are serialised into a single hidden CSV input
 * `name="tagIds"` so the saveItem server action picks them up without
 * any special handling.
 */
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { saveTag, deleteTag } from "@/app/menu/actions";
import {
  TAG_ICONS,
  TAG_ICON_NAMES,
  TAG_COLORS,
  chipClassForColor,
  resolveTagIcon,
  type TagColor,
} from "./tag-icons";

export type Tag = { id: string; name: string; icon: string; color: string };

export function TagPicker({
  allTags,
  defaultSelected,
  inputName = "tagIds",
}: {
  allTags: Tag[];
  defaultSelected: string[];
  inputName?: string;
}) {
  const { toast } = useToast();
  const [tags, setTags] = React.useState<Tag[]>(allTags);
  const [selected, setSelected] = React.useState<Set<string>>(new Set(defaultSelected));
  const [createOpen, setCreateOpen] = React.useState(false);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const csv = Array.from(selected).join(",");

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => {
          const Icon = resolveTagIcon(t.icon);
          const on = selected.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              className={
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors " +
                (on
                  ? chipClassForColor(t.color)
                  : "bg-background text-foreground border-input hover:bg-accent")
              }
            >
              <Icon className="h-3 w-3" />
              {t.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-dashed border-primary text-primary hover:bg-primary/10"
        >
          <Plus className="h-3 w-3" />
          New tag
        </button>
      </div>
      <input type="hidden" name={inputName} value={csv} />

      <TagEditorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(t) => {
          setTags((cur) => {
            const idx = cur.findIndex((x) => x.id === t.id);
            return idx === -1 ? [...cur, t] : cur.map((x, i) => (i === idx ? t : x));
          });
          // Auto-select newly created tags so the user doesn't have to
          // click twice to apply them to the item they were editing.
          setSelected((s) => new Set(s).add(t.id));
          toast({ variant: "success", title: "Tag saved" });
        }}
        onDeleted={(id) => {
          setTags((cur) => cur.filter((t) => t.id !== id));
          setSelected((s) => {
            const next = new Set(s);
            next.delete(id);
            return next;
          });
          toast({ variant: "success", title: "Tag deleted" });
        }}
        tags={tags}
      />
    </div>
  );
}

/**
 * Mini-editor for tags. Doubles as the "create new" form (top section)
 * and the "manage existing" list (bottom). Kept in one dialog so the
 * owner can both add and prune from a single entry point.
 */
function TagEditorDialog({
  open,
  onOpenChange,
  onSaved,
  onDeleted,
  tags,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: (t: Tag) => void;
  onDeleted: (id: string) => void;
  tags: Tag[];
}) {
  const { toast } = useToast();
  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState("Tag");
  const [color, setColor] = React.useState<TagColor>("slate");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName("");
      setIcon("Tag");
      setColor("slate");
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await saveTag({ name: name.trim(), icon, color });
      if (res.ok) {
        onSaved(res);
        setName("");
        setIcon("Tag");
        setColor("slate");
      } else {
        toast({ variant: "destructive", title: "Couldn't save", description: res.error });
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this tag? It will be removed from all items.")) return;
    const fd = new FormData();
    fd.set("id", id);
    await deleteTag(fd);
    onDeleted(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tags</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="border rounded-md p-3 space-y-2.5 bg-muted/30">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              New tag
            </div>
            <div>
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Smoky, Crunchy, Family meal"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
            </div>
            <div>
              <Label>Icon</Label>
              <div className="grid grid-cols-10 gap-1 mt-1 max-h-32 overflow-y-auto p-1 border rounded-md bg-background">
                {TAG_ICON_NAMES.map((n) => {
                  const I = TAG_ICONS[n];
                  const on = icon === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setIcon(n)}
                      title={n}
                      className={
                        "h-7 w-7 grid place-items-center rounded border " +
                        (on ? "border-primary bg-primary/10 text-primary" : "border-transparent hover:bg-accent")
                      }
                    >
                      <I className="h-3.5 w-3.5" />
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>Color</Label>
              <div className="flex gap-1.5 mt-1">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setColor(c.key)}
                    title={c.key}
                    className={
                      "h-6 w-6 rounded-full ring-2 ring-offset-1 transition-all " +
                      c.swatch +
                      " " +
                      (color === c.key ? "ring-primary" : "ring-transparent hover:ring-muted-foreground")
                    }
                  />
                ))}
              </div>
            </div>
            <Button
              type="button"
              onClick={submit}
              disabled={saving || !name.trim()}
              size="sm"
              className="w-full"
            >
              {saving ? "Saving…" : "Add tag"}
            </Button>
          </div>

          {tags.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Existing tags ({tags.length})
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-md">
                {tags.map((t) => {
                  const I = resolveTagIcon(t.icon);
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 px-2 py-1.5 border-b last:border-0 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border " +
                            chipClassForColor(t.color)
                          }
                        >
                          <I className="h-3 w-3" />
                          {t.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(t.id)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
