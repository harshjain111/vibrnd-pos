"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { saveInventorySettings } from "./actions";

export type Toggle = {
  key: string;
  label: string;
  type?: "boolean" | "select" | "number" | "text";
  options?: string[];
  default: string;
  current?: string;
};

export function SettingsForm({ tab, toggles }: { tab: string; toggles: Toggle[] }) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <form
      action={async (fd) => {
        try {
          await saveInventorySettings(tab, fd);
          toast({ variant: "success", title: "Settings saved" });
          router.refresh();
        } catch (e) {
          toast({ variant: "destructive", title: "Couldn't save", description: String(e) });
        }
      }}
      className="space-y-3"
    >
      {toggles.map((t) => {
        const type = t.type ?? "boolean";
        const cur = t.current ?? t.default;
        return (
          <div key={t.key} className="flex items-start justify-between gap-3 border-b last:border-0 pb-3 last:pb-0">
            <Label className="flex-1 text-sm font-normal pt-1">{t.label}</Label>
            {type === "boolean" && (
              <select name={t.key} defaultValue={cur} className="h-9 rounded-md border bg-background px-3 text-sm min-w-[100px]">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            )}
            {type === "select" && (
              <select name={t.key} defaultValue={cur} className="h-9 rounded-md border bg-background px-3 text-sm min-w-[160px]">
                {t.options?.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            {type === "number" && (
              <Input name={t.key} defaultValue={cur} type="number" className="h-9 w-32 text-right text-sm" />
            )}
            {type === "text" && (
              <Input name={t.key} defaultValue={cur} className="h-9 w-48 text-sm" />
            )}
          </div>
        );
      })}
      <div className="flex justify-end pt-2">
        <Button type="submit" size="sm">Save</Button>
      </div>
    </form>
  );
}
