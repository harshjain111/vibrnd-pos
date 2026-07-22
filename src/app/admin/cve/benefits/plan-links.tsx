"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { attachToPlanAction, detachFromPlanAction } from "./actions";
import { X } from "lucide-react";

export function AttachPlanForm({
  benefitDefId,
  defaultName,
  plans,
}: {
  benefitDefId: string;
  defaultName: string;
  plans: { id: string; name: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const [planId, setPlanId] = React.useState<string>(plans[0]?.id ?? "");
  const [displayName, setDisplayName] = React.useState<string>(defaultName);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={plans.length === 0}>
          Attach
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Attach to a plan</DialogTitle>
          <DialogDescription>
            Adds this benefit to the selected membership plan. Members will see it after the next
            evaluation.
          </DialogDescription>
        </DialogHeader>
        <form
          action={async (fd) => {
            await attachToPlanAction(fd);
            setOpen(false);
          }}
          className="space-y-3"
        >
          <input type="hidden" name="benefitDefId" value={benefitDefId} />
          <div>
            <Label htmlFor="planId">Plan</Label>
            <select
              id="planId"
              name="planId"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              name="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
              required
            />
            <div className="text-[10px] text-muted-foreground mt-0.5">
              What members see for this perk — defaults to the benefit&apos;s registry name.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit">
              Attach
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DetachBenefitButton({ membershipBenefitId }: { membershipBenefitId: string }) {
  return (
    <form action={detachFromPlanAction} className="inline">
      <input type="hidden" name="membershipBenefitId" value={membershipBenefitId} />
      <button
        type="submit"
        className="opacity-60 hover:opacity-100 text-muted-foreground hover:text-rose-700"
        title="Detach"
      >
        <X className="h-3 w-3" />
      </button>
    </form>
  );
}
