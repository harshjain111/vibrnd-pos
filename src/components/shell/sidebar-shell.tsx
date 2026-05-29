"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import { ChefHat, X, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { NavSection } from "./nav-config";
import { SidebarItem } from "./sidebar-item";
import { ICONS } from "./sidebar-item-icons";
import { cn } from "@/lib/utils";

/** Drawer (mobile) + collapse (desktop) state shared between the topbar hamburger and the sidebar. */
type Ctx = {
  open: boolean;
  setOpen: (v: boolean) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
};
const SidebarCtx = React.createContext<Ctx>({
  open: false,
  setOpen: () => {},
  collapsed: false,
  setCollapsed: () => {},
});

const COLLAPSED_KEY = "vibrnd:sidebar-collapsed";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [collapsed, setCollapsedState] = React.useState(false);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSED_KEY);
      if (stored === "1") setCollapsedState(true);
    } catch {}
  }, []);

  const setCollapsed = React.useCallback((v: boolean) => {
    setCollapsedState(v);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
    } catch {}
  }, []);

  React.useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <SidebarCtx.Provider value={{ open, setOpen, collapsed, setCollapsed }}>{children}</SidebarCtx.Provider>
  );
}

export function MenuButton() {
  const { setOpen } = React.useContext(SidebarCtx);
  return (
    <button
      onClick={() => setOpen(true)}
      className="lg:hidden inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-accent shrink-0"
      aria-label="Open menu"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}

export function SidebarShell({
  sections,
  role,
  pathname: pathnameProp,
}: {
  sections: NavSection[];
  role: string;
  /** Initial pathname from SSR; client-side `usePathname()` overrides this on hydration. */
  pathname: string;
}) {
  const { open, setOpen, collapsed, setCollapsed } = React.useContext(SidebarCtx);
  // Use the live client-side pathname so the highlight tracks the actual URL,
  // not the (possibly stale) middleware header captured at SSR.
  const livePath = usePathname();
  const pathname = livePath ?? pathnameProp;

  // Route-change side effects: close the mobile drawer. (Desktop sidebar stays open by default
  // so users can see where they are; they can collapse it manually with the toggle.)
  const lastPath = React.useRef(pathname);
  React.useEffect(() => {
    if (lastPath.current !== pathname) {
      setOpen(false);
      lastPath.current = pathname;
    }
  }, [pathname, setOpen]);

  // Pre-compute the single longest-matching href so parents (e.g. "/inventory")
  // don't light up alongside their children (e.g. "/inventory/units").
  const activeHref = React.useMemo(() => {
    let best: string | null = null;
    for (const s of sections) {
      for (const it of s.items) {
        const matches =
          it.href === "/"
            ? pathname === "/"
            : pathname === it.href || pathname.startsWith(it.href + "/");
        if (matches && (best === null || it.href.length > best.length)) best = it.href;
      }
    }
    return best;
  }, [sections, pathname]);

  const nav = (showLabels: boolean) => (
    <nav className={cn("p-3 pb-6 space-y-5", showLabels ? "text-sm" : "text-[10px]")}>
      {sections.map((section) => (
        <div key={section.label}>
          {showLabels && (
            <div className="px-2 mb-1 text-[10px] uppercase tracking-wider text-white/40 font-semibold">
              {section.label}
            </div>
          )}
          <ul className={showLabels ? "space-y-0.5" : "space-y-1"}>
            {section.items.map((item) =>
              showLabels ? (
                <SidebarItem key={item.href} item={item} pathname={pathname} activeHref={activeHref} />
              ) : (
                <CollapsedItem key={item.href} item={item} pathname={pathname} activeHref={activeHref} />
              )
            )}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Persistent sidebar at lg+ — expanded or collapsed */}
      <aside
        className={cn(
          "hidden lg:flex shrink-0 bg-sidebar text-sidebar-foreground h-screen sticky top-0 overflow-y-auto flex-col transition-[width] duration-200",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <Header
          role={role}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          onClose={null}
        />
        {nav(!collapsed)}
      </aside>

      {/* Backdrop for mobile drawer mode */}
      {open && (
        <button
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        />
      )}

      {/* Drawer at <lg — always full-width */}
      <aside
        className={cn(
          "lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground overflow-y-auto flex flex-col transform transition-transform",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Header role={role} collapsed={false} onToggleCollapse={null} onClose={() => setOpen(false)} />
        {nav(true)}
      </aside>
    </>
  );
}

function CollapsedItem({
  item,
  pathname,
  activeHref,
}: {
  item: NavSection["items"][number];
  pathname: string;
  activeHref?: string | null;
}) {
  // Render an icon-only version for the collapsed rail
  const active =
    activeHref !== undefined
      ? item.href === activeHref
      : item.href === "/"
        ? pathname === "/"
        : pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <li>
      <a
        href={item.href}
        className={cn(
          "relative flex items-center justify-center h-9 rounded-md mx-1 transition-colors",
          active ? "bg-sidebar-accent text-white" : "text-white/75 hover:bg-white/5 hover:text-white"
        )}
        title={item.label}
      >
        {active && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-white" aria-hidden />
        )}
        <IconLookup name={item.icon} />
      </a>
    </li>
  );
}

function IconLookup({ name }: { name: NavSection["items"][number]["icon"] }) {
  const Icon = name ? ICONS[name] : null;
  return Icon ? <Icon className="h-4 w-4" /> : null;
}

function Header({
  role,
  collapsed,
  onToggleCollapse,
  onClose,
}: {
  role: string;
  collapsed: boolean;
  onToggleCollapse: (() => void) | null;
  onClose: (() => void) | null;
}) {
  return (
    <div
      className={cn(
        "border-b border-white/10 flex items-center gap-2 shrink-0",
        collapsed ? "px-2 py-3 justify-center" : "px-5 py-4"
      )}
    >
      <div className="h-9 w-9 rounded-lg bg-sidebar-accent flex items-center justify-center shrink-0">
        <ChefHat className="h-5 w-5 text-white" />
      </div>
      {!collapsed && (
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white">Vibrnd POS</div>
          <div className="text-[11px] text-white/60 truncate">{role.toLowerCase()} · all-in-one</div>
        </div>
      )}
      {onToggleCollapse && !collapsed && (
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex h-8 w-8 rounded-md hover:bg-white/10 items-center justify-center text-white/80"
          aria-label="Collapse sidebar"
          title="Collapse"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      )}
      {onToggleCollapse && collapsed && (
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex absolute top-3 right-0 translate-x-1/2 h-6 w-6 rounded-md bg-sidebar border border-white/20 items-center justify-center text-white/80 z-10"
          aria-label="Expand sidebar"
          title="Expand"
          style={{ position: "absolute" }}
        >
          <PanelLeftOpen className="h-3.5 w-3.5" />
        </button>
      )}
      {onClose && (
        <button
          onClick={onClose}
          className="h-8 w-8 rounded-md hover:bg-white/10 flex items-center justify-center text-white/80"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
