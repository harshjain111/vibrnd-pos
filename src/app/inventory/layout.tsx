import { InventorySidebar } from "./_components/inv-sidebar";

/**
 * Nests every `/inventory/*` route under a two-pane layout: an inventory-specific
 * secondary sidebar on the left, page content on the right. Mirrors the
 * Petpooja-style module nav so users find every inventory sub-page from one place.
 */
export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-m-4 md:-m-6 flex min-h-[calc(100vh-3.5rem)]">
      <InventorySidebar />
      <div className="flex-1 min-w-0 p-4 md:p-6">{children}</div>
    </div>
  );
}
