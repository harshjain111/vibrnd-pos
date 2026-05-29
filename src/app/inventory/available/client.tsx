"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Star } from "lucide-react";
import { updateAvailable, toggleFavourite } from "./actions";

export function AvailableRow({
  id,
  currentQty,
  unit,
}: {
  id: string;
  currentQty: number;
  unit: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [qty, setQty] = React.useState<string>(String(currentQty));
  const [comments, setComments] = React.useState<string>("");
  const [pending, startTransition] = React.useTransition();

  const dirty = Number(qty) !== currentQty;

  const submit = () => {
    if (!dirty) return;
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("rawMaterialId", id);
        fd.set("newQty", qty);
        fd.set("comments", comments);
        await updateAvailable(fd);
        toast({ variant: "success", title: "Stock updated" });
        setComments("");
        router.refresh();
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't update", description: String(e) });
      }
    });
  };

  return (
    <>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Input
            type="number"
            step="0.01"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="h-7 w-24 text-right text-sm"
          />
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
      </TableCell>
      <TableCell>
        <Input
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="optional reason"
          className="h-7 w-40 text-xs"
        />
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" disabled={!dirty || pending} onClick={submit}>
          {pending ? "…" : "Save"}
        </Button>
      </TableCell>
    </>
  );
}

export function FavouriteToggle({ id, isFav }: { id: string; isFav: boolean }) {
  const router = useRouter();
  return (
    <form
      action={async (fd) => {
        await toggleFavourite(fd);
        router.refresh();
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-amber-500 hover:text-amber-600">
        <Star className={`h-4 w-4 ${isFav ? "fill-amber-500" : ""}`} />
      </button>
    </form>
  );
}
