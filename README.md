# Vibrnd POS

An all-in-one restaurant POS — a working clone of the Petpooja back-office surface area outlined in `petpooja_audit_notebook.md`.

**14 functional modules** + a working **billing/POS** flow + a **kitchen display** + **day-end close**:

| Module | Path | What it does |
|---|---|---|
| Dashboard | `/` | KPI cards, sales trend chart, hourly orders, payment / order-type split, leakage tracker, onboarding |
| Live orders | `/orders/live` | Running orders by type + **visual floor plan** with color-coded table status |
| All orders | `/orders` | Searchable / filterable order history with status + payment + channel |
| New bill (POS) | `/billing` | Catalog, cart, customer, tax+discount, 5 payment modes, settle → receipt. Auto-generates a KOT. |
| Receipt | `/billing/receipt/[id]` | Settled-order detail with print layout |
| **KDS** | `/kds` | **Live kitchen display** with NEW / In-progress / Ready columns, age timer, advance/cancel actions |
| **KOT history** | `/orders/kot` | Chronological ticket log with status counts and filters |
| Menu manager | `/menu` | Items + categories CRUD, veg/non-veg, GST per item, out-of-stock toggle |
| Inventory | `/inventory` | Raw materials with par/min levels, stock adjustments, low-stock alerts |
| Recipes | `/inventory/recipes` | Link items → raw materials. Drives auto-consumption on order settlement |
| Suppliers | `/inventory/suppliers` | Supplier master |
| Customers | `/customers` | Search, tags, lifetime spend, last-visit |
| Expenses | `/expenses` | Track expenses by category, vendor, payment mode |
| **Day End** | `/day-end` | Daily roll-up + per-day Z-report with payment split, denominations, expense listing |
| Reports hub | `/reports` | 6 working reports (sales summary, item-wise, category-wise, payment mode, customer spend, GST output) |
| **Settings** | `/settings` | Outlet details (name, GSTIN, FSSAI), dining tables CRUD, operational toggles |

**End-to-end POS flow:** Settle a bill at `/billing` → it creates an Order + an OrderItem per line + a KitchenTicket + decrements raw-material stock per recipe → the KOT appears on `/kds` → the kitchen advances it → it lands in `/orders/kot` and `/day-end` rolls it into the day's totals.

## Stack

- **Next.js 15** (App Router, Server Components, Server Actions)
- **Prisma 5** + **SQLite** (zero-config local DB)
- **Tailwind CSS** + a shadcn/ui-shaped component layer (`src/components/ui/*`)
- **Recharts** for dashboard graphs
- **Zod** for server-action input validation
- **lucide-react** icons

## Getting started

```bash
npm install           # installs deps + auto-runs `prisma generate`
npx prisma db push    # creates SQLite db + tables
npm run db:seed       # seeds outlet, menu, customers, rms, sample orders
npm run dev           # http://localhost:3000
```

To browse the DB visually: `npm run db:studio`.

## Project structure

```
src/
  app/
    layout.tsx              app shell (sidebar + topbar)
    page.tsx                dashboard
    _components/            chart + range-picker (shared client comps)
    billing/                POS billing screen + receipt + server actions
    orders/
      live/                 live orders
      page.tsx              all orders
    menu/                   menu CRUD
    inventory/              raw materials
      recipes/              recipe editor
      suppliers/            supplier master
    customers/              customer CRM
    expenses/               expense tracker
    reports/
      page.tsx              report catalog
      [slug]/page.tsx       6 report drilldowns
  components/
    shell/                  sidebar, topbar, page-header, nav-config
    ui/                     button, card, table, dialog, tabs, input, label, badge, select, empty
  lib/
    db.ts                   prisma singleton
    outlet.ts               active-outlet helper
    analytics.ts            dashboard KPIs + ranges
    utils.ts                cn(), inr(), inr2()
prisma/
  schema.prisma             11 models: Outlet, User, Category, Item, Customer, DiningTable,
                            Order, OrderItem, RawMaterial, Supplier, Recipe, RecipeIngredient, Expense
  seed.ts                   sample data (4 cats, 16 items, 7 rms, ~30-40 orders)
```

## What's intentionally stubbed (vs the full Petpooja audit)

Marked **"Soon"** in the sidebar — these schemas don't exist yet:

- Online Orders inbox (Swiggy/Zomato/Magicpin normalization)
- Campaigns / WhatsApp marketing
- Payments reconciliation (65+ providers)
- Multi-outlet HO console
- 74 of 80 reports (engine is parametric — add more cases to `src/app/reports/[slug]/page.tsx`)
- ~175 fine-grained user permission flags
- Aggregator integrations
- Captain mobile app / Kiosk

See `petpooja_audit_notebook.md` for the full audit and competitive notes.
