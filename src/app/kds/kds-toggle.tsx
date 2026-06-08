"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { toggleKdsEnabled } from "./actions";

/**
 * On/off pill button shown in the KDS page header. When ON, the kitchen
 * sees new tickets here; when OFF, the POS prints KOTs at the station
 * instead — useful when the kitchen tablet is down, internet is flaky,
 * or the owner just wants to switch back to a paper-only flow.
 *
 * Confirmation prompt on every flip so it's not toggled by accident.
 */
export function KdsToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();

  const onClick = () => {
    const confirmMsg = enabled
      ? "Turn KDS OFF? KOTs will print at the station instead of showing up here. In-flight tickets stay until served."
      : "Turn KDS back ON? New KOTs will start showing up here again.";
    if (!confirm(confirmMsg)) return;
    startTransition(async () => {
      try {
        await toggleKdsEnabled();
        toast({
          variant: "success",
          title: enabled ? "KDS turned OFF" : "KDS turned ON",
          description: enabled
            ? "New KOTs will print at the station. Existing tickets still visible here."
            : "New KOTs will route to this screen.",
        });
        router.refresh();
      } catch (e) {
        toast({ variant: "destructive", title: "Couldn't toggle KDS", description: String(e) });
      }
    });
  };

  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={pending}
      variant={enabled ? "outline" : "default"}
      size="sm"
      className={
        enabled
          ? "border-emerald-300 text-emerald-800 hover:bg-emerald-50"
          : "bg-rose-600 hover:bg-rose-700 text-white"
      }
      title={enabled ? "KDS is ON — click to switch to print-only mode" : "KDS is OFF — click to re-enable"}
    >
      {enabled ? (
        <>
          <Power className="h-4 w-4" />
          {pending ? "Turning off…" : "KDS ON"}
        </>
      ) : (
        <>
          <PowerOff className="h-4 w-4" />
          {pending ? "Turning on…" : "KDS OFF"}
        </>
      )}
    </Button>
  );
}
