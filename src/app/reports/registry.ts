/**
 * Report registry — the single source of truth.
 *
 * Per Reports_Module_Implementation_Spec §9 "build a report engine, not 88 reports":
 * - Each report is a JSON-ish definition (`ReportDef`).
 * - One viewer renders every implemented report.
 * - Unimplemented reports are still registered with `implemented: false` so the
 *   catalog can show the full ~80-report inventory and route to a stub.
 *
 * Tabs map to spec §1.2 ("Catalog tabs on the main Reports page"):
 *   Favourite · All Restaurant · Order · Item · Category · Customer · Discount · Others
 */
export type ReportTab =
  | "all_restaurant"
  | "order"
  | "item"
  | "category"
  | "customer"
  | "discount"
  | "others";

export type ReportDef = {
  slug: string;
  name: string;
  desc: string;
  tab: ReportTab;
  /** When false, the slug renders a "Coming soon" stub but still appears in the catalog. */
  implemented: boolean;
  /** Top-12 reports per spec §2.1 — surfaced via a "Top 12" highlight. */
  topTwelve?: boolean;
};

export const REPORT_TABS: { id: ReportTab; label: string }[] = [
  { id: "all_restaurant", label: "All Restaurant" },
  { id: "order", label: "Order Related" },
  { id: "item", label: "Item Related" },
  { id: "category", label: "Category Related" },
  { id: "customer", label: "Customer Related" },
  { id: "discount", label: "Discount Related" },
  { id: "others", label: "Others" },
];

export const REPORTS: ReportDef[] = [
  // ─── Order tab ───
  { slug: "sales-summary",      name: "Sales Summary",                 desc: "Per outlet, per day — gross, discount, tax, net.", tab: "order", implemented: true,  topTwelve: true },
  { slug: "growth",             name: "Growth Report: Day-Wise",       desc: "Day-wise sales with period-over-period delta.", tab: "order", implemented: true },
  { slug: "cancelled",          name: "Void / Cancelled Order Report", desc: "Voided orders with reason — anti-theft signal.", tab: "order", implemented: true,  topTwelve: true },
  { slug: "payment-mode",       name: "Payment Mode Sales",            desc: "Tender breakdown by mode + % of total.", tab: "order", implemented: true,  topTwelve: true },
  { slug: "bill-settlement",    name: "Bill Settlement Report",        desc: "Per-bill detail with tender + timestamps.", tab: "order", implemented: true,  topTwelve: true },
  { slug: "online-order",       name: "Online Order Report",           desc: "Aggregator orders with commission and timeline.", tab: "order", implemented: true,  topTwelve: true },
  { slug: "tip-report",         name: "Tip Summary",                   desc: "Tips collected by day and payment mode.", tab: "order", implemented: true },
  { slug: "sub-type",           name: "Order Report: Sub-Order Wise",  desc: "Revenue by sub-type (Parcel, AC, Bar…).", tab: "order", implemented: true },
  { slug: "locality",           name: "Locality Wise Report (Single Outlet)", desc: "Delivery revenue grouped by area.", tab: "order", implemented: true },
  { slug: "advance-orders",     name: "Advance Order Master Report",   desc: "Pre-booked / future-dated orders.", tab: "order", implemented: false },
  { slug: "comp-orders",        name: "Complimentary Order Report",    desc: "Comp bills with reason and customer.", tab: "order", implemented: false },
  { slug: "after-print-mod",    name: "Order Report: After Print Modification", desc: "Bills modified after print — anti-theft.", tab: "order", implemented: false },
  { slug: "order-print-count",  name: "Order Print Count Report",      desc: "Re-prints per order.", tab: "order", implemented: false },
  { slug: "pos-collection",     name: "POS Collection Report",         desc: "Payments + taxes + category sales snapshot.", tab: "order", implemented: false },
  { slug: "exec-sales",         name: "Executive Sales Report",        desc: "Short sales + advance-bookings summary.", tab: "order", implemented: false },

  // ─── Item tab ───
  { slug: "item-wise",          name: "Item-Wise Sales",               desc: "Top-selling items by qty and revenue.", tab: "item", implemented: true, topTwelve: true },
  { slug: "hourly-items",       name: "Item Sale Report: Hourly Wise", desc: "Heatmap of items × hour.", tab: "item", implemented: true },
  { slug: "highest-selling",    name: "Highest Selling Items Report",  desc: "Top sellers summary.", tab: "item", implemented: false },
  { slug: "addon-item-wise",    name: "Addon: Item Wise Report",       desc: "Addons sold per parent item.", tab: "item", implemented: false },
  { slug: "item-with-bill",     name: "Item Wise Report with Bill No", desc: "Items with the bill numbers that sold them.", tab: "item", implemented: false },
  { slug: "item-day-wise",      name: "Item Report: Day Wise",         desc: "Per-item per-day sales.", tab: "item", implemented: false },
  { slug: "variation",          name: "Variation Report",              desc: "Per-variation sales grouping.", tab: "item", implemented: false },
  { slug: "kot-process-time",   name: "KOT Itemwise Process Time",     desc: "Kitchen prep time per item.", tab: "item", implemented: false },
  { slug: "hsn",                name: "HSN Report",                    desc: "HSN-wise tax bifurcation — GSTR-1 ready.", tab: "item", implemented: true, topTwelve: true },
  { slug: "tax-item-wise",      name: "Tax Report: Item Wise",         desc: "Per-item CGST/SGST/IGST split.", tab: "item", implemented: true, topTwelve: true },
  { slug: "tax-report",         name: "GST Output (legacy)",           desc: "Tax collected by rate slab.", tab: "item", implemented: true },
  { slug: "non-chargeable",     name: "Non-Chargeable Item Report",    desc: "Items whose price was changed before billing.", tab: "item", implemented: false },
  { slug: "item-customer",      name: "Item Report with Customer/Order", desc: "Per-item with customer + order context.", tab: "item", implemented: false },
  { slug: "kot-negative-qty",   name: "KOT Report: Negative Quantity", desc: "KOTs with negative qty.", tab: "item", implemented: false },
  { slug: "item-invoice-neg",   name: "Item Invoice Report: Negative Qty", desc: "Items with negative invoice qty.", tab: "item", implemented: false },
  { slug: "kot-mods",           name: "KOT Report: Modifications of Item", desc: "Items modified on KOTs after print.", tab: "item", implemented: false },
  { slug: "order-audit",        name: "Order Audit: Item Wise",        desc: "Per-item modifications with staff name.", tab: "item", implemented: false },
  { slug: "item-price-area",    name: "Item Price Report: Area Wise",  desc: "Per-area price audit.", tab: "item", implemented: false },
  { slug: "item-perf",          name: "Item Performance Report",       desc: "Item performance on online channels.", tab: "item", implemented: false },

  // ─── Category tab ───
  { slug: "category-wise",      name: "Category-Wise Sales",           desc: "Sales rolled up by category.", tab: "category", implemented: true, topTwelve: true },
  { slug: "group-wise",         name: "Sales Report: Group Wise",      desc: "Items sold per group.", tab: "category", implemented: false },
  { slug: "group-day-wise",     name: "Group Wise Report: Per Day Wise", desc: "Group sales per day.", tab: "category", implemented: false },
  { slug: "tax-bifur-category", name: "Tax Bifurcation: Category Wise", desc: "Tax per category.", tab: "category", implemented: false },
  { slug: "tax-bifur-group",    name: "Tax Bifurcation: Group Wise",   desc: "Tax per group.", tab: "category", implemented: false },
  { slug: "sales-brand",        name: "Sales Report: Brand Wise",      desc: "Items sold per brand.", tab: "category", implemented: false },
  { slug: "brand-day-wise",     name: "Brand Wise Report: Per Day Wise", desc: "Brand sales per day.", tab: "category", implemented: false },
  { slug: "tax-bifur-brand",    name: "Tax Bifurcation: Brand Wise",   desc: "Tax per brand.", tab: "category", implemented: false },
  { slug: "sales-tag",          name: "Sales Report: Tag Wise",        desc: "Items sold per tag.", tab: "category", implemented: false },

  // ─── Customer tab ───
  { slug: "customer-spend",     name: "Total Customer Spend Report",   desc: "Lifetime spend per customer.", tab: "customer", implemented: true, topTwelve: true },
  { slug: "customer-per-inv",   name: "Customer Spend Report: Per Invoice", desc: "Average spend per person per invoice.", tab: "customer", implemented: false },

  // ─── Discount tab ───
  { slug: "discount-report",    name: "Discount Report",               desc: "All discounts on online + offline orders.", tab: "discount", implemented: true },
  { slug: "total-coupon",       name: "Total Coupon Report",           desc: "All coupon codes with order details.", tab: "discount", implemented: false },
  { slug: "coupon-consumption", name: "Discount Coupon Consumption",   desc: "Coupons issued vs applied in a period.", tab: "discount", implemented: false },
  { slug: "auto-discount",      name: "Auto Discount Report",          desc: "Auto-discount totals and order counts.", tab: "discount", implemented: false },
  { slug: "bogo-discount",      name: "BOGO Discount Report",          desc: "BOGO offer redemption summary.", tab: "discount", implemented: false },
  { slug: "discount-with-reason", name: "Discounted Orders: Outlet Wise (With Reason)", desc: "Discounted orders with reason.", tab: "discount", implemented: false },
  { slug: "cofunded-discount",  name: "Orderwise Co-Funded Discount Summary", desc: "Merchant vs aggregator share.", tab: "discount", implemented: false },

  // ─── Others tab ───
  { slug: "captain",            name: "Captain Performance Report",    desc: "Sales attributed per captain/biller.", tab: "others", implemented: true },
  { slug: "biller-wise",        name: "Sales Report: Biller Wise",     desc: "Sales per biller.", tab: "others", implemented: false },
  { slug: "waiter-perf",        name: "Waiter / Delivery Boy Performance", desc: "Orders served/delivered per staff.", tab: "others", implemented: false },
  { slug: "online-platforms",   name: "Sales Report: Online Platforms", desc: "Sales from each aggregator.", tab: "others", implemented: false },
  { slug: "due-payment",        name: "Due Payment Report",            desc: "Outstanding due per customer.", tab: "others", implemented: false },
  { slug: "received-due",       name: "Received Due Payment Report",   desc: "Payments received from due orders.", tab: "others", implemented: false },
  { slug: "restaurant-timing",  name: "Restaurant Timing Summary",     desc: "Sales by time-band (breakfast/lunch/dinner).", tab: "others", implemented: false },
  { slug: "virtual-wallet",     name: "Virtual Wallet Report",         desc: "Wallet transactions.", tab: "others", implemented: false },
  { slug: "loyalty",            name: "Loyalty Report",                desc: "Loyalty earn / redeem ledger.", tab: "others", implemented: false },
  { slug: "gift-card",          name: "Gift Card Transaction Report",  desc: "Gift-card sales and redemptions.", tab: "others", implemented: false },
  { slug: "online-activity",    name: "Online Order Activity Report",  desc: "Stage / status timeline per online order.", tab: "others", implemented: false },
  { slug: "callcenter-agent",   name: "Sales Report: Call Center Agent Wise", desc: "Online sales per call-center agent.", tab: "others", implemented: false },

  // ─── All Restaurant tab ───
  { slug: "all-rest-sales",     name: "All Restaurant Sales Report",   desc: "Total sales of every outlet, in one view.", tab: "all_restaurant", implemented: false },
  { slug: "all-rest-day-wise",  name: "All Restaurant Report: Day Wise", desc: "Per-day per-outlet summary.", tab: "all_restaurant", implemented: false },
  { slug: "all-rest-hourly-item", name: "Hourly Item Wise: All Restaurants", desc: "Hour × item across outlets.", tab: "all_restaurant", implemented: false },
  { slug: "all-rest-invoice",   name: "Invoice Report: All Restaurants", desc: "Per-invoice list across outlets.", tab: "all_restaurant", implemented: false },
  { slug: "outlet-item-row",    name: "Outlet-Item Wise (Row)",        desc: "Items × outlets pivot.", tab: "all_restaurant", implemented: false },
  { slug: "outlet-item-col",    name: "Outlet-Item Wise (Column)",     desc: "Same data, items in columns.", tab: "all_restaurant", implemented: false },
  { slug: "pax-biller",         name: "Pax Sales Report: Biller Wise", desc: "Per-biller avg revenue per pax.", tab: "all_restaurant", implemented: false },
  { slug: "cancel-all-rest",    name: "Cancel Order Report: All Restaurants", desc: "Cancellations across outlets.", tab: "all_restaurant", implemented: false },
  { slug: "cancel-item-wise",   name: "Cancel Order Report: Item Wise (All Restaurants)", desc: "Cancellations at the item level.", tab: "all_restaurant", implemented: false },
  { slug: "all-rest-orders-master", name: "Orders Master Report: All Restaurants", desc: "Every order with customer/charges.", tab: "all_restaurant", implemented: false },
  { slug: "all-rest-item",      name: "Item Wise Report: All Restaurants", desc: "Per-item totals across outlets.", tab: "all_restaurant", implemented: false },
];

export function byTab(tab: ReportTab): ReportDef[] {
  return REPORTS.filter((r) => r.tab === tab);
}

export function findReport(slug: string): ReportDef | undefined {
  return REPORTS.find((r) => r.slug === slug);
}
