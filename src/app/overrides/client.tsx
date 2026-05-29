"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
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
import { useToast } from "@/components/ui/use-toast";
import { Check, X } from "lucide-react";
import { decideOverride } from "./actions";

export function DecideButtons({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState<"approve" | "reject" | null>(null);
  const [pending, startTransition] = React.useTransition();

  return (
    <div className="inline-flex gap-1">
      <Button size="sm" variant="outline" onClick={() => setOpen("approve")}>
        <Check className="h-3.5 w-3.5" />
        Approve
      </Button>
      <Button size="sm" variant="ghost" className="text-rose-700" onClick={() => setOpen("reject")}>
        <X className="h-3.5 w-3.5" />
        Reject
      </Button>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{open === "approve" ? "Approve override" : "Reject override"}</DialogTitle>
          </DialogHeader>
          <form
            action={(fd) => {
              fd.set("id", id);
              fd.set("approved", open === "approve" ? "true" : "false");
              startTransition(async () => {
                try {
                  await decideOverride(fd);
                  toast({
                    variant: open === "approve" ? "success" : "destructive",
                    title: open === "approve" ? "Approved" : "Rejected",
                  });
                  setOpen(null);
                  router.refresh();
                } catch (e) {
                  toast({ variant: "destructive", title: "Failed", description: String(e) });
                }
              });
            }}
            className="space-y-3"
          >
            <div>
              <Label>Resolution note (optional)</Label>
              <Input name="resolution" placeholder="e.g. Customer complaint, owner-approved" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(null)}>
                Cancel
              </Button>
              <Button type="submit" variant={open === "approve" ? "default" : "destructive"} disabled={pending}>
                {pending ? "Saving…" : open === "approve" ? "Approve" : "Reject"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
