"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Save, RotateCcw, Lock } from "lucide-react";
import { savePermissions, resetPermissions } from "./actions";

type PageRow = {
  id: string;
  label: string;
  category: string;
  ownerOnly: boolean;
  defaults: Record<string, boolean>;
};

export function PermissionsForm({
  pages,
  initialChecked,
  roles,
  categories,
}: {
  pages: PageRow[];
  initialChecked: Record<string, Record<string, boolean>>;
  roles: string[];
  categories: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [checked, setChecked] = React.useState(initialChecked);

  const toggle = (pageId: string, role: string) => {
    const page = pages.find((p) => p.id === pageId);
    if (page?.ownerOnly && role !== "OWNER") return; // locked
    setChecked((prev) => ({
      ...prev,
      [pageId]: { ...prev[pageId], [role]: !prev[pageId][role] },
    }));
  };

  const onSave = () => {
    const allowed: string[] = [];
    for (const pageId of Object.keys(checked)) {
      for (const role of roles) {
        if (checked[pageId][role]) allowed.push(`${role}:${pageId}`);
      }
    }
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("allowed", allowed.join(","));
        await savePermissions(fd);
        toast({ variant: "success", title: "Permissions saved" });
        router.refresh();
      } catch (e) {
        toast({ variant: "destructive", title: "Save failed", description: String(e) });
      }
    });
  };

  const onReset = () => {
    if (!confirm("Reset every role's access to the defaults? This wipes all your custom toggles.")) return;
    startTransition(async () => {
      try {
        await resetPermissions();
        toast({ variant: "success", title: "Defaults restored" });
        // Reset local state to defaults from props.
        const fresh: Record<string, Record<string, boolean>> = {};
        for (const p of pages) {
          fresh[p.id] = { ...p.defaults };
        }
        setChecked(fresh);
        router.refresh();
      } catch (e) {
        toast({ variant: "destructive", title: "Reset failed", description: String(e) });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left font-semibold p-2 w-[40%]">Page</th>
              {roles.map((r) => (
                <th key={r} className="text-center font-semibold p-2">
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <React.Fragment key={cat}>
                <tr className="bg-muted/40">
                  <td colSpan={roles.length + 1} className="px-2 py-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                    {cat}
                  </td>
                </tr>
                {pages
                  .filter((p) => p.category === cat)
                  .map((page) => (
                    <tr key={page.id} className="border-b last:border-0">
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{page.label}</span>
                          {page.ownerOnly && (
                            <Badge variant="secondary" className="text-[9px] inline-flex items-center gap-1">
                              <Lock className="h-2.5 w-2.5" />
                              Owner only
                            </Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">{page.id}</div>
                      </td>
                      {roles.map((r) => {
                        const isOwner = r === "OWNER";
                        const locked = page.ownerOnly && !isOwner;
                        return (
                          <td key={r} className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={locked ? false : !!checked[page.id]?.[r]}
                              disabled={locked || (isOwner && !page.ownerOnly && false)}
                              onChange={() => toggle(page.id, r)}
                              className="h-4 w-4 accent-primary"
                              title={locked ? "Owner-only page" : `${r} can ${checked[page.id]?.[r] ? "access" : "not access"} ${page.label}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="outline" onClick={onReset} disabled={pending}>
          <RotateCcw className="h-4 w-4" />
          Reset to defaults
        </Button>
        <Button onClick={onSave} disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
