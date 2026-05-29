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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Trash2, KeyRound } from "lucide-react";
import { createUser, updateUser, resetPassword, deleteUser } from "./actions";

const ROLES = ["OWNER", "MANAGER", "BILLER", "CAPTAIN"] as const;

export function AddUserDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = useActionState(createUser, null);
  const { toast } = useToast();
  const lastRef = React.useRef(state);

  React.useEffect(() => {
    if (state && state !== lastRef.current) {
      if (!state.error) {
        toast({ variant: "success", title: "User invited" });
        setOpen(false);
      }
      lastRef.current = state;
    }
  }, [state, toast]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
          <DialogDescription>They can sign in immediately with the password you set.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Name</Label>
            <Input name="name" required placeholder="Ramesh Kumar" />
          </div>
          <div className="col-span-2">
            <Label>Email</Label>
            <Input name="email" type="email" required placeholder="ramesh@smokzy.com" />
          </div>
          <div>
            <Label>Role</Label>
            <select name="role" defaultValue="BILLER" className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Password</Label>
            <Input name="password" type="text" required minLength={6} placeholder="min 6 chars" />
          </div>
          {state?.error && (
            <div className="col-span-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{state.error}</div>
          )}
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Inviting…" : "Invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditUserDialog({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial: { id: string; name: string; role: (typeof ROLES)[number]; active: boolean; commissionRate: number };
}) {
  const [open, setOpen] = React.useState(false);
  const { toast } = useToast();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            await updateUser(fd);
            toast({ variant: "success", title: "Updated" });
            setOpen(false);
          }}
          className="grid grid-cols-2 gap-3"
        >
          <input type="hidden" name="id" value={initial.id} />
          <div className="col-span-2">
            <Label>Name</Label>
            <Input name="name" defaultValue={initial.name} required />
          </div>
          <div>
            <Label>Role</Label>
            <select
              name="role"
              defaultValue={initial.role}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <Label>Commission rate (%)</Label>
            <Input
              name="commissionRate"
              type="number"
              step="0.1"
              min="0"
              max="100"
              defaultValue={initial.commissionRate}
              placeholder="0"
            />
            <div className="text-xs text-muted-foreground mt-1">
              % of order revenue earned as commission for orders this user takes as captain.
            </div>
          </div>
          <label className="col-span-2 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={initial.active} />
            Active (uncheck to suspend)
          </label>
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

export function ResetPasswordDialog({ id, email }: { id: string; email: string }) {
  const [open, setOpen] = React.useState(false);
  const { toast } = useToast();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Reset password">
          <KeyRound className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>Set a new password for {email}. They can change it later.</DialogDescription>
        </DialogHeader>
        <form
          action={async (fd) => {
            await resetPassword(fd);
            toast({ variant: "success", title: "Password reset" });
            setOpen(false);
          }}
          className="space-y-3"
        >
          <input type="hidden" name="id" value={id} />
          <div>
            <Label>New password</Label>
            <Input name="password" type="text" required minLength={6} placeholder="min 6 chars" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Reset</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteUserButton({ id, email, disabled }: { id: string; email: string; disabled?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground"
      disabled={disabled || pending}
      title={disabled ? "You can't delete yourself" : `Delete ${email}`}
      onClick={() => {
        if (!confirm(`Delete user ${email}? They lose access immediately.`)) return;
        const fd = new FormData();
        fd.append("id", id);
        startTransition(async () => {
          try {
            await deleteUser(fd);
            toast({ variant: "destructive", title: `Deleted ${email}` });
            router.refresh();
          } catch (e) {
            toast({ variant: "destructive", title: "Failed to delete", description: String(e) });
          }
        });
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
