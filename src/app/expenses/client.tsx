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
import { Check, X, Flag } from "lucide-react";
import { saveExpense, approveExpense, rejectExpense, clearOwnerFlag } from "./actions";

const CATEGORIES = ["RENT", "SALARY", "UTILITIES", "RAW_MATERIAL", "MARKETING", "OTHER"];
const MODES = ["CASH", "UPI", "CARD", "BANK_TRANSFER"];

export function ExpenseDialog({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log expense</DialogTitle>
          <DialogDescription>Goes into approval queue: Manager → Auditor → Approved.</DialogDescription>
        </DialogHeader>
        <form
          action={async (fd) => {
            await saveExpense(fd);
            toast({ variant: "success", title: "Expense logged", description: "Pending manager approval" });
            setOpen(false);
            router.refresh();
          }}
          className="grid grid-cols-2 gap-3"
        >
          <div>
            <Label>Category</Label>
            <select name="category" defaultValue="OTHER" className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Payment mode</Label>
            <select name="paymentMode" defaultValue="CASH" className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <Label>Vendor</Label>
            <Input name="vendor" placeholder="e.g. BESCOM, Landlord" />
          </div>
          <div className="col-span-2">
            <Label>Amount (₹)</Label>
            <Input name="amount" type="number" step="0.01" min="0.01" required />
          </div>
          <div className="col-span-2">
            <Label>Note</Label>
            <Input name="note" placeholder="Context for approver" />
          </div>
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Submit for approval</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ApproveButton({ id, asRole }: { id: string; asRole: "MANAGER" | "AUDITOR" }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        const fd = new FormData();
        fd.append("id", id);
        fd.append("asRole", asRole);
        startTransition(async () => {
          try {
            await approveExpense(fd);
            toast({ variant: "success", title: `Approved as ${asRole}` });
            router.refresh();
          } catch (e) {
            toast({ variant: "destructive", title: "Approval failed", description: String(e) });
          }
        });
      }}
    >
      <Check className="h-3.5 w-3.5" />
      Approve · {asRole === "MANAGER" ? "Mgr" : "Aud"}
    </Button>
  );
}

export function RejectButton({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  return (
    <>
      <Button variant="ghost" size="sm" className="text-rose-700" onClick={() => setOpen(true)}>
        <X className="h-3.5 w-3.5" />
        Reject
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject expense</DialogTitle>
            <DialogDescription>
              Reason is mandatory. The rejection is flagged to the Owner.
            </DialogDescription>
          </DialogHeader>
          <form
            action={(fd) => {
              fd.set("id", id);
              startTransition(async () => {
                try {
                  await rejectExpense(fd);
                  toast({ variant: "destructive", title: "Expense rejected", description: "Flagged to Owner" });
                  setOpen(false);
                  router.refresh();
                } catch (e) {
                  toast({ variant: "destructive", title: "Failed", description: String(e) });
                }
              });
            }}
            className="space-y-3"
          >
            <div>
              <Label>Reason</Label>
              <Input name="reason" required minLength={3} placeholder="e.g. Vendor quote does not match agreed rate" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? "Rejecting…" : "Reject + flag Owner"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ClearFlagButton({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        const fd = new FormData();
        fd.append("id", id);
        startTransition(async () => {
          await clearOwnerFlag(fd);
          toast({ variant: "success", title: "Flag cleared" });
          router.refresh();
        });
      }}
    >
      <Flag className="h-3.5 w-3.5" />
      Clear flag
    </Button>
  );
}
