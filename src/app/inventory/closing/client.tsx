"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { Lock, Unlock, Save } from "lucide-react";
import { saveClosing, freezeClosing, unfreezeClosing } from "./actions";

type RmLine = {
  rawMaterialId: string;
  name: string;
  category: string;
  unit: string;
  expectedQty: number;
  countedQty: number;
  variance: number;
  comments: string;
};

export function ClosingGrid({
  businessDay,
  frozen,
  rmLines,
}: {
  businessDay: string;
  frozen: boolean;
  rmLines: RmLine[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [lines, setLines] = React.useState<RmLine[]>(rmLines);
  const [pending, startTransition] = React.useTransition();

  const update = (id: string, patch: Partial<RmLine>) => {
    setLines((ls) =>
      ls.map((l) => {
        if (l.rawMaterialId !== id) return l;
        const next = { ...l, ...patch };
        next.variance = next.countedQty - next.expectedQty;
        return next;
      })
    );
  };

  const submit = () => {
    startTransition(async () => {
      try {
        await saveClosing({
          businessDay,
          lines: lines.map((l) => ({
            rawMaterialId: l.rawMaterialId,
            countedQty: l.countedQty,
            comments: l.comments,
          })),
        });
        toast({ variant: "success", title: "Closing saved" });
        router.refresh();
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't save", description: String(e) });
      }
    });
  };

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-muted-foreground">
          {lines.length} raw material{lines.length === 1 ? "" : "s"}
          {frozen && <Badge variant="destructive" className="ml-2 text-[10px]">Frozen</Badge>}
        </div>
        <div className="flex gap-2">
          <Button onClick={submit} disabled={frozen || pending} size="sm">
            <Save className="h-4 w-4" />
            {pending ? "Saving…" : "Save closing"}
          </Button>
          {!frozen ? (
            <form
              action={async (fd) => {
                if (!confirm("Freeze closing for this day? Only the Owner can unfreeze.")) return;
                try {
                  await freezeClosing(fd);
                  toast({ variant: "success", title: "Closing frozen" });
                  router.refresh();
                } catch (e) {
                  toast({ variant: "destructive", title: "Couldn't freeze", description: String(e) });
                }
              }}
              className="inline"
            >
              <input type="hidden" name="businessDay" value={businessDay} />
              <Button type="submit" variant="outline" size="sm">
                <Lock className="h-4 w-4" />
                Freeze
              </Button>
            </form>
          ) : (
            <form
              action={async (fd) => {
                if (!confirm("Unfreeze (Owner only)?")) return;
                try {
                  await unfreezeClosing(fd);
                  toast({ variant: "success", title: "Closing unfrozen" });
                  router.refresh();
                } catch (e) {
                  toast({ variant: "destructive", title: "Couldn't unfreeze", description: String(e) });
                }
              }}
              className="inline"
            >
              <input type="hidden" name="businessDay" value={businessDay} />
              <Button type="submit" variant="outline" size="sm">
                <Unlock className="h-4 w-4" />
                Unfreeze
              </Button>
            </form>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Raw Material</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right">Counted</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead>Comments</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.rawMaterialId}>
                <TableCell className="text-xs text-muted-foreground">{l.category || "—"}</TableCell>
                <TableCell className="font-medium">{l.name}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {l.expectedQty} <span className="text-[10px]">{l.unit}</span>
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    step="0.01"
                    value={l.countedQty}
                    onChange={(e) => update(l.rawMaterialId, { countedQty: Number(e.target.value) || 0 })}
                    className="h-7 w-24 text-right text-sm inline-block"
                    disabled={frozen}
                  />
                  <span className="text-[10px] text-muted-foreground ml-1">{l.unit}</span>
                </TableCell>
                <TableCell className={`text-right text-sm ${l.variance === 0 ? "text-muted-foreground" : l.variance > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {l.variance > 0 ? "+" : ""}
                  {l.variance.toFixed(2)}
                </TableCell>
                <TableCell>
                  <Input
                    value={l.comments}
                    onChange={(e) => update(l.rawMaterialId, { comments: e.target.value })}
                    placeholder="optional"
                    className="h-7 w-48 text-xs"
                    disabled={frozen}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
