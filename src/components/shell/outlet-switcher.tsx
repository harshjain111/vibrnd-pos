"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Plus, Store } from "lucide-react";
import { switchOutlet } from "@/app/outlets/actions";
import { useToast } from "@/components/ui/use-toast";

export type OutletOption = { id: string; name: string; code: string };

export function OutletSwitcher({
  active,
  options,
  canManage,
}: {
  active: { id: string; name: string; code: string };
  options: OutletOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // No switcher needed if there's only one option and you can't manage
  if (options.length <= 1 && !canManage) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="text-sm font-medium truncate">{active.name}</div>
        <span className="text-xs text-muted-foreground hidden sm:inline">Outlet ID {active.code}</span>
      </div>
    );
  }

  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md hover:bg-accent px-1.5 py-1 -ml-1.5 max-w-full"
      >
        <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate max-w-[140px] sm:max-w-[220px]">{active.name}</span>
        <span className="text-xs text-muted-foreground hidden sm:inline">{active.code}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 mt-1 w-64 rounded-md border bg-popover shadow-lg z-50 p-1">
          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Switch outlet
          </div>
          {options.map((o) => {
            const isActive = o.id === active.id;
            return (
              <form
                key={o.id}
                action={async (fd) => {
                  if (isActive) return;
                  startTransition(async () => {
                    await switchOutlet(fd);
                    toast({ variant: "success", title: `Switched to ${o.name}` });
                    setOpen(false);
                    router.refresh();
                  });
                }}
              >
                <input type="hidden" name="id" value={o.id} />
                <button
                  type="submit"
                  disabled={isActive || pending}
                  className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm rounded ${
                    isActive ? "bg-muted text-muted-foreground" : "hover:bg-accent"
                  }`}
                >
                  <Store className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 truncate">{o.name}</span>
                  <span className="text-[10px] text-muted-foreground">{o.code}</span>
                </button>
              </form>
            );
          })}
          {canManage && (
            <>
              <div className="border-t my-1" />
              <Link
                href="/outlets"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5" />
                Manage outlets
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
