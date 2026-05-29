"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { ChevronRight, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { advanceTicket, cancelTicket } from "./actions";

export function AdvanceButton({
  id,
  status,
}: {
  id: string;
  status: "NEW" | "IN_PROGRESS" | "READY";
}) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();

  const next = status === "NEW" ? "Start" : status === "IN_PROGRESS" ? "Mark ready" : "Mark served";
  const variantNext = status === "READY" ? "default" : "secondary";

  return (
    <Button
      onClick={() => {
        const fd = new FormData();
        fd.append("id", id);
        startTransition(async () => {
          await advanceTicket(fd);
          toast({
            variant: status === "READY" ? "default" : "success",
            title: status === "NEW" ? "Started cooking" : status === "IN_PROGRESS" ? "Food ready 🔔" : "Served",
          });
        });
      }}
      size="sm"
      className="w-full"
      variant={variantNext as any}
      disabled={pending}
    >
      {next}
      <ChevronRight className="h-3.5 w-3.5" />
    </Button>
  );
}

export function CancelButton({ id, kotNo }: { id: string; kotNo: string }) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      onClick={() => {
        if (!confirm(`Cancel ${kotNo}? The order itself isn't affected — only this kitchen ticket.`)) return;
        const fd = new FormData();
        fd.append("id", id);
        startTransition(async () => {
          await cancelTicket(fd);
          toast({ variant: "destructive", title: "KOT cancelled", description: kotNo });
        });
      }}
      size="icon"
      variant="ghost"
      className="h-8 w-8 text-muted-foreground"
      disabled={pending}
    >
      <X className="h-4 w-4" />
    </Button>
  );
}
