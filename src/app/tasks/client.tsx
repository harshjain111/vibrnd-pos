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
import { CheckCircle2, Trash2 } from "lucide-react";
import { createTask, completeTask, deleteTask, saveTemplate, deleteTemplate } from "./actions";

const ROLES = ["OWNER", "MANAGER", "BILLER", "CAPTAIN"] as const;
const CADENCES = ["DAILY", "WEEKLY", "MONTHLY"] as const;

export function NewTaskDialog({
  children,
  users,
}: {
  children: React.ReactNode;
  users: { id: string; name: string; role: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New ad-hoc task</DialogTitle>
          <DialogDescription>One-off issue or to-do. Assign to a role or a specific person.</DialogDescription>
        </DialogHeader>
        <form
          action={async (fd) => {
            await createTask(fd);
            toast({ variant: "success", title: "Task created" });
            setOpen(false);
            router.refresh();
          }}
          className="grid grid-cols-2 gap-3"
        >
          <div className="col-span-2">
            <Label>Title</Label>
            <Input name="title" required placeholder="Replace broken table light at T7" />
          </div>
          <div className="col-span-2">
            <Label>Detail</Label>
            <Input name="description" placeholder="Optional context" />
          </div>
          <div>
            <Label>Type</Label>
            <select name="type" defaultValue="ADHOC" className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="ADHOC">Ad-hoc issue</option>
              <option value="TODO">To-do</option>
            </select>
          </div>
          <div>
            <Label>Due</Label>
            <Input name="dueAt" type="datetime-local" />
          </div>
          <div>
            <Label>Assign role</Label>
            <select name="assignedRole" defaultValue="" className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Any</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>or assign person</Label>
            <select name="assignedToId" defaultValue="" className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">— None —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type TmplInit = {
  id?: string;
  title: string;
  description: string;
  cadence: typeof CADENCES[number];
  defaultRole: string;
  slaMinutes: number;
  active: boolean;
};

export function NewTemplateDialog({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial?: TmplInit;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit duty" : "Recurring duty"}</DialogTitle>
          <DialogDescription>
            Auto-generates a new task each cadence (e.g. Day-end stock count every day).
          </DialogDescription>
        </DialogHeader>
        <form
          action={async (fd) => {
            await saveTemplate(fd);
            toast({ variant: "success", title: "Duty saved" });
            setOpen(false);
            router.refresh();
          }}
          className="grid grid-cols-2 gap-3"
        >
          {initial?.id && <input type="hidden" name="id" value={initial.id} />}
          <div className="col-span-2">
            <Label>Title</Label>
            <Input name="title" required defaultValue={initial?.title} placeholder="Day-end stock count" />
          </div>
          <div className="col-span-2">
            <Label>Detail</Label>
            <Input name="description" defaultValue={initial?.description} placeholder="Optional" />
          </div>
          <div>
            <Label>Cadence</Label>
            <select name="cadence" defaultValue={initial?.cadence ?? "DAILY"} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              {CADENCES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Default role</Label>
            <select name="defaultRole" defaultValue={initial?.defaultRole ?? ""} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Any</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>SLA (minutes)</Label>
            <Input name="slaMinutes" type="number" min="0" defaultValue={initial?.slaMinutes ?? 0} />
          </div>
          <label className="col-span-2 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} />
            Active
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

export function CompleteButton({ id, title }: { id: string; title: string }) {
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
        startTransition(async () => {
          await completeTask(fd);
          toast({ variant: "success", title: "Done", description: title });
          router.refresh();
        });
      }}
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      Done
    </Button>
  );
}

export function DeleteTaskButton({ id, title }: { id: string; title: string }) {
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
        if (!confirm(`Delete "${title}"?`)) return;
        const fd = new FormData();
        fd.append("id", id);
        startTransition(async () => {
          await deleteTask(fd);
          toast({ variant: "destructive", title: "Deleted" });
          router.refresh();
        });
      }}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

export function DeleteTemplateButton({ id, title }: { id: string; title: string }) {
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
        if (!confirm(`Delete duty "${title}"? Existing tasks aren't affected.`)) return;
        const fd = new FormData();
        fd.append("id", id);
        startTransition(async () => {
          await deleteTemplate(fd);
          toast({ variant: "destructive", title: "Deleted" });
          router.refresh();
        });
      }}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
