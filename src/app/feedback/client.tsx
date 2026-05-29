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
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Check, Star, Trash2 } from "lucide-react";
import { saveFeedback, resolveFeedback, deleteFeedback } from "./actions";

const CATEGORIES = ["FOOD", "SERVICE", "AMBIANCE", "DELIVERY", "OTHER"] as const;

export function FeedbackDialog({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [rating, setRating] = React.useState(5);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Capture feedback</DialogTitle>
          <DialogDescription>Log a customer comment, complaint, or compliment.</DialogDescription>
        </DialogHeader>
        <form
          action={async (fd) => {
            fd.set("rating", String(rating));
            await saveFeedback(fd);
            toast({ variant: "success", title: "Feedback saved" });
            setOpen(false);
            setRating(5);
            router.refresh();
          }}
          className="grid grid-cols-2 gap-3"
        >
          <div>
            <Label>Category</Label>
            <select name="category" defaultValue="FOOD" className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Rating</Label>
            <div className="flex items-center gap-0.5 mt-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className="p-1 hover:scale-110 transition-transform"
                  aria-label={`${n} stars`}
                >
                  <Star className={`h-5 w-5 ${n <= rating ? "fill-amber-500 text-amber-500" : "text-muted-foreground/40"}`} />
                </button>
              ))}
            </div>
          </div>
          <div className="col-span-2">
            <Label>Comment</Label>
            <Input name="text" placeholder="What did the customer say?" />
          </div>
          <div>
            <Label>Customer phone</Label>
            <Input name="customerPhone" placeholder="Optional" />
          </div>
          <div>
            <Label>Order invoice no</Label>
            <Input name="orderInvoiceNo" placeholder="Optional INV-…" className="font-mono" />
          </div>
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ResolveDialog({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Check className="h-3.5 w-3.5" />
          Resolve
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve feedback</DialogTitle>
          <DialogDescription>What action was taken? Recorded on the audit trail.</DialogDescription>
        </DialogHeader>
        <form
          action={async (fd) => {
            await resolveFeedback(fd);
            toast({ variant: "success", title: "Marked resolved" });
            setOpen(false);
            router.refresh();
          }}
          className="space-y-3"
        >
          <input type="hidden" name="id" value={id} />
          <div>
            <Label>Resolution note</Label>
            <Input name="note" placeholder="e.g. Refunded ₹200, manager apologised" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Mark resolved</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteFeedbackButton({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground"
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this feedback?")) return;
        const fd = new FormData();
        fd.append("id", id);
        startTransition(async () => {
          await deleteFeedback(fd);
          toast({ variant: "destructive", title: "Deleted" });
          router.refresh();
        });
      }}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
