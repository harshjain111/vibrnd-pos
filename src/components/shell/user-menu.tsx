"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { LogOut, ChevronDown, User as UserIcon } from "lucide-react";
import { signOut } from "@/app/login/actions";

export function UserMenu({ name, email, role }: { name: string; email: string; role: string }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const initial = name?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent"
      >
        <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
          {initial}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-56 rounded-md border bg-popover shadow-lg z-50 p-1">
          <div className="px-3 py-2 border-b">
            <div className="text-sm font-medium leading-tight flex items-center gap-1.5">
              <UserIcon className="h-3.5 w-3.5" />
              {name}
            </div>
            <div className="text-xs text-muted-foreground">{email}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{role}</div>
          </div>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm" className="w-full justify-start mt-1">
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
