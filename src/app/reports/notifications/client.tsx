"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Trash2, Play, Pause, Send } from "lucide-react";
import { deleteNotification, toggleStatus, sendNow } from "./actions";

export function DeleteNotificationBtn({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <form
      action={async (fd) => {
        if (!confirm("Delete this schedule?")) return;
        try { await deleteNotification(fd); toast({ variant: "success", title: "Deleted" }); router.refresh(); }
        catch (e) { toast({ variant: "destructive", title: "Couldn't delete", description: String(e) }); }
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" className="text-rose-600">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </form>
  );
}

export function ToggleStatusBtn({ id, status }: { id: string; status: "ACTIVE" | "INACTIVE" }) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <form
      action={async (fd) => {
        try { await toggleStatus(fd); toast({ variant: "success", title: status === "ACTIVE" ? "Paused" : "Resumed" }); router.refresh(); }
        catch (e) { toast({ variant: "destructive", title: "Couldn't change", description: String(e) }); }
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm">
        {status === "ACTIVE" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>
    </form>
  );
}

export function SendNowBtn({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <form
      action={async (fd) => {
        try {
          await sendNow(fd);
          toast({ variant: "success", title: "Sent", description: "Demo: log row recorded. Production would email recipients." });
          router.refresh();
        } catch (e) {
          toast({ variant: "destructive", title: "Couldn't send", description: String(e) });
        }
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" title="Send now (test)">
        <Send className="h-3.5 w-3.5" />
      </Button>
    </form>
  );
}
