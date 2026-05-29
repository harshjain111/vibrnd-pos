"use client";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-config";
import { ICONS } from "./sidebar-item-icons";

export function SidebarItem({
  item,
  pathname,
  activeHref,
}: {
  item: NavItem;
  pathname: string;
  /** Pre-computed longest-matching href across the whole nav. Avoids parent routes lighting up alongside children. */
  activeHref?: string | null;
}) {
  // Active rule:
  // 1) If the parent supplies an `activeHref`, use exact match against it (single source of truth).
  // 2) Else (legacy callers) fall back to a prefix check, with the homepage requiring exact match.
  const active =
    activeHref !== undefined
      ? item.href === activeHref
      : item.href === "/"
        ? pathname === "/"
        : pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon = item.icon ? ICONS[item.icon] : null;
  return (
    <li>
      <Link
        href={item.href}
        className={cn(
          "relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors",
          active
            ? "bg-sidebar-accent text-white font-semibold shadow-sm"
            : "text-white/75 hover:bg-white/5 hover:text-white"
        )}
      >
        {active && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-white" aria-hidden />
        )}
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        <span className="flex-1">{item.label}</span>
        {item.soon && (
          <span className="text-[9px] uppercase bg-white/10 text-white/60 px-1.5 py-0.5 rounded">
            Soon
          </span>
        )}
      </Link>
    </li>
  );
}
