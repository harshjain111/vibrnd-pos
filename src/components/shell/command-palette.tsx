"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, Loader2, Layers, Package, Users, Receipt } from "lucide-react";

/**
 * Cmd-K command palette (audit §5.6 — Global UX).
 *
 * Press Cmd/Ctrl-K from anywhere to open. Fuzzy-filter across:
 *   • Pages — every route this user can access (per the permission registry)
 *   • Items — menu items, by name or short code
 *   • Customers — by name or phone
 *   • Orders — by invoice number
 *
 * Enter on a result navigates to it. Esc closes. ↑↓ moves the selection.
 */
type Group = "pages" | "items" | "customers" | "orders";
type Result = {
  id: string;
  label: string;
  sub?: string;
  href: string;
  group: Group;
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<{
    pages: { id: string; label: string; category: string; href: string }[];
    items: { id: string; label: string; shortCode: string | null; price: number; href: string }[];
    customers: { id: string; label: string; phone: string | null; href: string }[];
    orders: { id: string; label: string; status: string; grand: number; href: string }[];
  }>({ pages: [], items: [], customers: [], orders: [] });
  const [selected, setSelected] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Global hot-key.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Refresh the index every time the palette opens.
  React.useEffect(() => {
    if (!open) return;
    setQ("");
    setSelected(0);
    setLoading(true);
    fetch("/api/palette")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  // In-memory filter (case-insensitive contains on label + sub-text).
  const filtered: Result[] = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    const matches = (s: string | null | undefined) => !term || (s ?? "").toLowerCase().includes(term);
    const out: Result[] = [];
    for (const p of data.pages) {
      if (matches(p.label) || matches(p.category)) {
        out.push({ id: p.id, label: p.label, sub: p.category, href: p.href, group: "pages" });
      }
    }
    for (const it of data.items) {
      if (matches(it.label) || matches(it.shortCode)) {
        out.push({ id: it.id, label: it.label, sub: it.shortCode ? `code ${it.shortCode}` : `₹${it.price}`, href: it.href, group: "items" });
      }
    }
    for (const c of data.customers) {
      if (matches(c.label) || matches(c.phone)) {
        out.push({ id: c.id, label: c.label, sub: c.phone ?? undefined, href: c.href, group: "customers" });
      }
    }
    for (const o of data.orders) {
      if (matches(o.label)) {
        out.push({ id: o.id, label: o.label, sub: `${o.status} · ₹${o.grand}`, href: o.href, group: "orders" });
      }
    }
    return out.slice(0, 50);
  }, [q, data]);

  const onNavigate = (r: Result) => {
    setOpen(false);
    router.push(r.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(filtered.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = filtered[selected];
      if (r) onNavigate(r);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-card rounded-lg border shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSelected(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page, item, customer or order…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <span className="text-[10px] text-muted-foreground border rounded px-1 py-0.5">ESC</span>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground inline-flex items-center justify-center gap-2 w-full">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading index…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No matches.</div>
          ) : (
            <ul>
              {filtered.map((r, i) => {
                const Icon = ICONS[r.group];
                return (
                  <li key={`${r.group}:${r.id}`}>
                    <button
                      onMouseMove={() => setSelected(i)}
                      onClick={() => onNavigate(r)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                        i === selected ? "bg-accent" : "hover:bg-accent/50"
                      }`}
                    >
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="font-medium truncate block">{r.label}</span>
                        {r.sub && <span className="text-xs text-muted-foreground truncate block">{r.sub}</span>}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-3 py-1.5 border-t text-[10px] text-muted-foreground flex items-center justify-between">
          <span>Pages · Items · Customers · Orders</span>
          <span>↑↓ navigate · ⏎ open · ESC close</span>
        </div>
      </div>
    </div>
  );
}

const ICONS: Record<Group, React.ComponentType<{ className?: string }>> = {
  pages: Layers,
  items: Package,
  customers: Users,
  orders: Receipt,
};
