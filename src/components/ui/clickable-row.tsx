"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Drop-in replacement for <TableRow> that turns the entire row into a link.
 * Click anywhere in the row → router.push(href). Adds cursor + hover styles.
 */
export function ClickableRow({
  href,
  children,
  className,
  ...rest
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLTableRowElement>, "onClick">) {
  const router = useRouter();
  return (
    <TableRow
      {...rest}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
      tabIndex={0}
      role="link"
      className={cn(
        "cursor-pointer transition-colors hover:bg-accent/60 focus:bg-accent focus:outline-none",
        className
      )}
    >
      {children}
    </TableRow>
  );
}
