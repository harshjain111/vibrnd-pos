"use client";
import * as React from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { UserPlus } from "lucide-react";
import { assignTableToCustomer } from "./actions";

/**
 * Receptionist entry — clicking an empty table opens this dialog. Captures
 * the customer's name + phone + birthday + anniversary + allergies and
 * creates a RUNNING Order with no items. The captain picks it up next.
 *
 * After save we navigate to /billing?order=<id> so the captain can start
 * punching items immediately — that route already knows how to resume an
 * existing RUNNING order via the `?order=` param.
 */
export function AssignTableDialog({
  tableId,
  tableName,
  children,
}: {
  tableId: string;
  tableName: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [birthday, setBirthday] = React.useState("");
  const [anniversary, setAnniversary] = React.useState("");
  const [allergies, setAllergies] = React.useState("");
  const [specialNotes, setSpecialNotes] = React.useState("");

  // Reset when the dialog closes so the next click starts fresh.
  React.useEffect(() => {
    if (!open) {
      setName("");
      setPhone("");
      setBirthday("");
      setAnniversary("");
      setAllergies("");
      setSpecialNotes("");
    }
  }, [open]);

  const submit = () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Customer name is required" });
      return;
    }
    if (!phone.trim()) {
      toast({ variant: "destructive", title: "Phone number is required" });
      return;
    }
    startTransition(async () => {
      const res = await assignTableToCustomer({
        tableId,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerBirthday: birthday || undefined,
        customerAnniversary: anniversary || undefined,
        customerAllergies: allergies.trim() || undefined,
        customerSpecialNotes: specialNotes.trim() || undefined,
      });
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Couldn't assign table",
          description: res.error,
        });
        return;
      }
      toast({
        variant: "success",
        title: `${name} assigned to ${tableName}`,
        description: `Bill ${res.invoiceNo} — handed off to the captain.`,
      });
      setOpen(false);
      // The captain (or the receptionist themselves with the right perm)
      // can continue at the billing screen with this order pre-loaded.
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <UserPlus className="h-4 w-4 inline -mt-0.5 mr-1.5" />
            Assign customer to {tableName}
          </DialogTitle>
          <DialogDescription>
            Register the guest now so the captain can start punching orders.
            Allergies + anniversary stick to the profile for next time too.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Guest name"
                autoFocus
              />
            </div>
            <div>
              <Label>Phone *</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91…"
                inputMode="tel"
              />
            </div>
            <div>
              <Label>Birthday</Label>
              <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
            </div>
            <div>
              <Label>Anniversary</Label>
              <Input type="date" value={anniversary} onChange={(e) => setAnniversary(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Allergies / dietary notes</Label>
            <Input
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="e.g. peanut, lactose · stays on the profile"
            />
          </div>
          <div>
            <Label>Special notes</Label>
            <Textarea
              value={specialNotes}
              onChange={(e) => setSpecialNotes(e.target.value)}
              placeholder="VIP family · wheelchair seating · son's name Aarav — surfaced to the captain on every future visit"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Assigning…" : "Assign + handoff to captain"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
