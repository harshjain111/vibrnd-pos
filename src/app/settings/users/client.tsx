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
import { Copy, Wand2 } from "lucide-react";
import { createUser, updateUser, resetPassword, deleteUser, seedTestUsers } from "./actions";

import { ROLES as ALL_ROLES } from "@/lib/role-types";

// All roles — POS hierarchy first, then the inventory / procurement
// roles. Grouped in the select via <optgroup> so the dropdown reads
// naturally despite being long. Each entry carries a one-line label so
// the SM picking a role doesn't have to remember what each ALLCAPS key
// actually does.
const POS_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "OWNER",        label: "OWNER — full access (incl. users / permissions)" },
  { value: "MANAGER",      label: "MANAGER — operations + reports + void items" },
  { value: "BILLER",       label: "BILLER — cashier: settle bills, move tables, split, comp" },
  { value: "CAPTAIN",      label: "CAPTAIN — punch orders + send KOTs" },
  { value: "RECEPTIONIST", label: "RECEPTIONIST — floor plan: register customers + assign tables" },
];
const INVENTORY_ROLE_LABELS: Record<string, string> = {
  STORE_MANAGER:      "STORE_MANAGER — approve requisitions, raise POs, manage GRNs",
  COST_CONTROLLER:    "COST_CONTROLLER — approve POs, procurement cockpit",
  ACCOUNTANT:         "ACCOUNTANT — vendor invoices, payments, GRN review",
  CHEF_HOD:           "CHEF_HOD — kitchen requisitions + dept stock view",
  BARTENDER_HOD:      "BARTENDER_HOD — bar requisitions + dept stock view",
  HOUSEKEEPING_HOD:   "HOUSEKEEPING_HOD — housekeeping requisitions + dept stock view",
  PRODUCTION_MANAGER: "PRODUCTION_MANAGER — base-kitchen production runs",
};
const INVENTORY_ROLE_OPTIONS = ALL_ROLES
  .filter((r) => !POS_ROLE_OPTIONS.some((p) => p.value === r))
  .map((r) => ({ value: r, label: INVENTORY_ROLE_LABELS[r] ?? r }));
const ROLES = ALL_ROLES;

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
              <optgroup label="POS / Front of house">
                {POS_ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Inventory / Procurement">
                {INVENTORY_ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </optgroup>
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
              <optgroup label="POS / Front of house">
                {POS_ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Inventory / Procurement">
                {INVENTORY_ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </optgroup>
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

/* ──────────────────────────────────────────────────────────────────────
   "Seed test users" — one-click provisioning of one Manager / Cashier /
   Captain / Receptionist test account so the owner can log out, sign
   back in as each role, and visually confirm the role-aware UI without
   typing emails into forms.
   ────────────────────────────────────────────────────────────────────── */
export function SeedTestUsersButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [rows, setRows] = React.useState<
    {
      role: string;
      email: string;
      name: string;
      password: string;
      status: "created" | "existed" | "failed";
      error?: string;
    }[]
  >([]);

  const run = () => {
    startTransition(async () => {
      const res = await seedTestUsers();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't seed", description: res.error });
        return;
      }
      setRows(res.rows);
      setOpen(true);
      router.refresh();
    });
  };

  const copy = (s: string) => {
    navigator.clipboard?.writeText(s);
    toast({ title: "Copied" });
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={run} disabled={pending} title="Provision one test user per role">
        <Wand2 className="h-4 w-4" />
        {pending ? "Seeding…" : "Seed test users"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Test users ready</DialogTitle>
            <DialogDescription>
              Sign out, log back in as any of the below to see what their role sees.
              Existing accounts are kept as-is.
            </DialogDescription>
          </DialogHeader>
          {rows.some((r) => r.status === "failed") && (
            <div className="rounded-md border border-rose-300 bg-rose-50/60 p-2 text-xs text-rose-900">
              One or more rows failed. Hover the red pill for the reason.
            </div>
          )}
          <div className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.email}
                className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {r.name}{" "}
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground ml-1">
                      {r.role}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate">
                    {r.email} · {r.password}
                  </div>
                </div>
                <span
                  className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 ${
                    r.status === "created"
                      ? "bg-emerald-100 text-emerald-800"
                      : r.status === "failed"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-muted text-muted-foreground"
                  }`}
                  title={r.error ?? ""}
                >
                  {r.status === "existed" ? "reset" : r.status}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copy(`${r.email} / ${r.password}`)}
                  title="Copy email / password"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
