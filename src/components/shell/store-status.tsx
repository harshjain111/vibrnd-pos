"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { Lock, Unlock } from "lucide-react";
import { toggleStoreOpen } from "@/app/settings/actions";

export function StoreStatusToggle({ open }: { open: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();

  return (
    <button
      onClick={() => {
        if (!confirm(open ? "Close the store? Online orders will be paused." : "Reopen the store?")) return;
        startTransition(async () => {
          await toggleStoreOpen();
          toast({
            variant: open ? "warning" : "success",
            title: open ? "Store closed" : "Store open",
          });
          router.refresh();
        });
      }}
      disabled={pending}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
        open
          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
          : "bg-rose-100 text-rose-800 hover:bg-rose-200"
      }`}
      title={open ? "Click to close store" : "Click to reopen store"}
    >
      {open ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
      {open ? "OPEN" : "CLOSED"}
    </button>
  );
}
