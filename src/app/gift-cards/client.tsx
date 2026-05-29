"use client";
import * as React from "react";
import { useActionState } from "react";
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
import { Power, Plus } from "lucide-react";
import { issueGiftCard, topUpGiftCard, deactivateGiftCard } from "./actions";

export function IssueDialog({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = useActionState(issueGiftCard, null);
  const last = React.useRef(state);
  React.useEffect(() => {
    if (state && state !== last.current) {
      if (!state.error) {
        toast({ variant: "success", title: "Gift card issued" });
        setOpen(false);
        router.refresh();
      }
      last.current = state;
    }
  }, [state, toast, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue gift card</DialogTitle>
          <DialogDescription>Customer can redeem this code at checkout.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Code</Label>
            <Input name="code" required placeholder="DIWALI500" className="font-mono uppercase" />
          </div>
          <div>
            <Label>Amount (₹)</Label>
            <Input name="amount" type="number" step="0.01" min="1" required />
          </div>
          <div>
            <Label>Expires on (optional)</Label>
            <Input name="expiresAt" type="date" />
          </div>
          <div className="col-span-2">
            <Label>Customer phone (optional)</Label>
            <Input name="customerPhone" placeholder="+919812345670" />
          </div>
          {state?.error && (
            <div className="col-span-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{state.error}</div>
          )}
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Issuing…" : "Issue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TopUpButton({ id, code }: { id: string; code: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Top up balance">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Top up {code}</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            await topUpGiftCard(fd);
            toast({ variant: "success", title: "Card topped up" });
            setOpen(false);
            router.refresh();
          }}
          className="space-y-3"
        >
          <input type="hidden" name="id" value={id} />
          <div>
            <Label>Amount to add (₹)</Label>
            <Input name="amount" type="number" step="0.01" min="1" required autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Top up</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeactivateButton({ id, code, active }: { id: string; code: string; active: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground"
      disabled={pending}
      title={active ? "Deactivate" : "Reactivate"}
      onClick={() => {
        if (!confirm(`${active ? "Deactivate" : "Reactivate"} ${code}?`)) return;
        const fd = new FormData();
        fd.append("id", id);
        startTransition(async () => {
          await deactivateGiftCard(fd);
          toast({ variant: active ? "destructive" : "success", title: `${code} ${active ? "deactivated" : "reactivated"}` });
          router.refresh();
        });
      }}
    >
      <Power className="h-4 w-4" />
    </Button>
  );
}
