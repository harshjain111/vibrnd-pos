import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Consistent GET-form filter toolbar — a search field, any page-supplied
 * selects (as children), and Apply / Clear. Server-component friendly (plain
 * `<form method="get">`); replaces the raw `<select>/<input>` strips on
 * movements / departments / reports / raw-materials.
 */
export function FilterBar({
  action,
  searchName = "q",
  searchPlaceholder = "Search…",
  searchDefault = "",
  showSearch = true,
  showClear = true,
  className,
  children,
}: {
  action: string;
  searchName?: string;
  searchPlaceholder?: string;
  searchDefault?: string;
  showSearch?: boolean;
  showClear?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <form action={action} className={cn("flex flex-wrap items-end gap-2", className)}>
      {showSearch && (
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name={searchName}
            defaultValue={searchDefault}
            placeholder={searchPlaceholder}
            className="pl-8"
          />
        </div>
      )}
      {children}
      <Button type="submit" variant="secondary" size="sm">
        Apply
      </Button>
      {showClear && (
        <Button type="button" variant="ghost" size="sm" asChild>
          <Link href={action}>Clear</Link>
        </Button>
      )}
    </form>
  );
}

/** A labelled `<select>` styled to match Input, for use inside FilterBar. */
export function FilterSelect({
  name,
  defaultValue,
  disabled,
  title,
  className,
  children,
}: {
  name: string;
  defaultValue?: string;
  disabled?: boolean;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      disabled={disabled}
      title={title}
      className={cn(
        "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50",
        className
      )}
    >
      {children}
    </select>
  );
}
