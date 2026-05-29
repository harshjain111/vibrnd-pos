import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { SettingsForm, type Toggle } from "./client";

export const dynamic = "force-dynamic";

const TABS: { id: string; label: string; toggles: Toggle[] }[] = [
  {
    id: "consumption",
    label: "Consumption & Production",
    toggles: [
      { key: "auto_consume", label: "Auto-consume inventory by recipe?", default: "false" },
      { key: "scope_order_types", label: "Which order types trigger auto-consumption?", type: "select", options: ["DEFAULT", "ONLINE", "OFFLINE", "BOTH"], default: "DEFAULT" },
      { key: "notify_par", label: "Notify in POS + Inventory when stock hits at-par?", default: "true" },
      { key: "auto_oos", label: "Mark item out-of-stock when raw material below min level + notify?", default: "false" },
      { key: "notify_kitchen_par", label: "Notify kitchen when raw material below at-par?", default: "false" },
      { key: "reverse_on_cancel_online", label: "Reverse consumption on online-order cancellation?", default: "true" },
      { key: "capture_avg_price_prod", label: "Capture avg purchase price for converted products?", default: "false" },
      { key: "restrict_negative_prod", label: "Restrict production when input stock is negative?", default: "false" },
      { key: "rm_groups_multi_recipe", label: "Enable raw material groups + multiple recipes?", default: "false" },
      { key: "multi_conversion_rm", label: "Enable multiple conversion at raw-material level?", default: "false" },
      { key: "actual_production_flow", label: "Enable actual production flow while convert RM?", default: "false" },
      { key: "production_time_slots", label: "Set specific time slot for production?", default: "false" },
    ],
  },
  {
    id: "purchase_order",
    label: "Purchase Order",
    toggles: [
      { key: "po_send_email_default", label: "Send PO via email by default?", default: "true" },
      { key: "po_send_whatsapp", label: "Allow sending PO via WhatsApp?", default: "true" },
      { key: "po_lock_after_sent", label: "Lock PO editing after Sent?", default: "true" },
      { key: "po_auto_generate_no", label: "Auto-generate PO numbers?", default: "true" },
    ],
  },
  {
    id: "stock_purchase",
    label: "Stock Purchase",
    toggles: [
      { key: "price_variance_tolerance", label: "Price variance tolerance %", type: "number", default: "2" },
      { key: "require_invoice_upload", label: "Require invoice upload?", default: "false" },
      { key: "require_batch_expiry", label: "Require batch + expiry per line?", default: "false" },
      { key: "default_update_stock", label: "Default 'Update Inventory Stock' ON?", default: "true" },
    ],
  },
  {
    id: "sales_transfer",
    label: "Sales & Transfer",
    toggles: [
      { key: "transfer_two_step", label: "Require two-step transfer (Sent → Received)?", default: "true" },
      { key: "transfer_log_variance", label: "Log variance when received qty ≠ sent?", default: "true" },
      { key: "sales_third_party", label: "Allow sales to third-party (non-POS)?", default: "false" },
    ],
  },
  {
    id: "common",
    label: "Sales & Purchase (common)",
    toggles: [
      { key: "round_off", label: "Round-off rule", type: "select", options: ["NONE", "NEAREST_INT", "NEAREST_HALF"], default: "NEAREST_INT" },
      { key: "show_hsn_invoices", label: "Show HSN on invoices?", default: "true" },
    ],
  },
  {
    id: "closing",
    label: "Closing Stock",
    toggles: [
      { key: "closing_frequency", label: "Required closing frequency", type: "select", options: ["DAILY", "WEEKLY", "BI_WEEKLY", "MONTHLY"], default: "DAILY" },
      { key: "freeze_on_save", label: "Auto-freeze closing on save?", default: "false" },
      { key: "owner_only_unfreeze", label: "Only Owner can unfreeze a frozen closing?", default: "true" },
    ],
  },
  {
    id: "other",
    label: "Other",
    toggles: [
      { key: "favourites_lift", label: "Lift favourites to top in pickers?", default: "true" },
      { key: "scan_purchase", label: "Enable Scan & Purchase barcode flow?", default: "true" },
      { key: "ai_recipe_suggest", label: "Show AI-Powered Recipe Suggestions banner?", default: "false" },
    ],
  },
  {
    id: "ledger",
    label: "Ledger",
    toggles: [
      { key: "vendor_ledger_visible", label: "Show vendor ledger to Managers?", default: "true" },
      { key: "allocate_payments", label: "Allow allocating one payment across multiple invoices?", default: "true" },
    ],
  },
  {
    id: "batchwise",
    label: "Batchwise",
    toggles: [
      { key: "track_batch", label: "Track batches per raw material?", default: "false" },
      { key: "fefo", label: "Use FEFO (first-expiry-first-out) deduction?", default: "false" },
      { key: "expiry_alert_days", label: "Alert N days before expiry", type: "number", default: "7" },
    ],
  },
];

export default async function InventorySettingsPage() {
  const outlet = await getActiveOutlet();
  const rows = await db.inventorySetting.findMany({ where: { outletId: outlet.id } });
  const values = new Map(rows.map((r) => [r.key, r.value]));

  return (
    <div>
      <PageHeader title="Inventory Settings" description="Rules-as-data. Each tab batches its toggles into one Save." />
      <Tabs defaultValue={TABS[0].id}>
        <TabsList className="flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.id} value={t.id}>
            <Card>
              <CardContent className="p-4">
                <SettingsForm
                  tab={t.id}
                  toggles={t.toggles.map((tg) => ({ ...tg, current: values.get(tg.key) ?? tg.default }))}
                />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
