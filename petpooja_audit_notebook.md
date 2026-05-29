# Petpooja Comprehensive Audit — Working Notebook

**Audit owner:** Smokzy account (Outlet ID 402305)
**Auditor:** Claude
**Date started:** 26 May 2026
**Purpose:** Feature-by-feature, button-by-button audit of Petpooja so a competing all-in-one POS can be built without missing a single capability.

---

## 0. Petpooja Ecosystem Map (subdomain-level)

Petpooja is not a single app — it is a **suite of 11+ products** spread across subdomains, plus a marketplace of integrations. Any competitor must replicate every one of these surfaces (or consciously decide not to).

| # | Product | Subdomain | One-line purpose |
|---|---------|-----------|------------------|
| 1 | **Billing / Back-office** | billing.petpooja.com | Core POS back-office: dashboard, orders, KOT, reports, management, CRM |
| 2 | **Menu Manager** | menu.petpooja.com | Centralized menu, items, categories, discounts, item-on/off, image upload |
| 3 | **Inventory** | inventory.petpooja.com | Stock, recipe, raw material, vendor, wastage, stock-take |
| 4 | **Supplier / Hyperpure** | supplier.petpooja.com | Raw-material procurement marketplace |
| 5 | **Bazaar** | bazaar.petpooja.com | Marketplace for restaurant equipment/consumables |
| 6 | **Marketing Automation** | marketing.petpooja.com | Campaigns, ads, customer marketing |
| 7 | **TRM (Table Reservation Manager)** | reservations.petpooja.com | Table booking, guest CRM, waitlist |
| 8 | **Payroll** | payroll.petpooja.com | Staff salary, attendance, payslips |
| 9 | **Task / Project Mgmt** | tasksdashboard.petpooja.com | Internal team task management |
| 10 | **Finance** | finance.petpooja.com | Financial overview / accounting layer |
| 11 | **Purchase (AI)** | purchase.petpooja.com | AI-driven inventory purchase suggestions |
| 12 | **Marketplace add-ons** | billing.petpooja.com/market | Captain App, KDS, Kiosk, Website builder, 100+ integrations |

---

## 1. Top-level Navigation — Billing Back-office (Sidebar)

The collapsible left sidebar groups everything in the back-office under these sections:

### A. **Dashboard** (`/users/dashboard`)
- Single page; KPIs, charts, leakage, action center, summary

### B. **Daily Operations**
- Live Orders — `/orders/running_orders/`
- All Orders — `/orders/order_list/`
- Online Orders — `/onlines/online_dashboard/`
- KOT — `/items/kot_list/`
- Due Payment Settlement — `/orders/due_payment_listing/`
- Explore Hyperpure — `supplier.petpooja.com/buy/search?hp=1`

### C. **Menu** (mostly external on menu.petpooja.com)
- Menu & Discounts — `menu.petpooja.com/menus/menu_management`
- Multi-Item Images Upload — `menu.petpooja.com/menus/upload_item_images`
- Menu on/off — `menu.petpooja.com/menus/item_on_off/`

### D. **Inventory** (external on inventory.petpooja.com)
- Inventory Dashboard — `inventory.petpooja.com/inventory_dashboard/new_inventory_dashboard/`

### E. **Marketing Automation** (`/users/marketing_redirect`) — flagged "New"

### F. **Reports**
- Day End Summary — `/day_end/day_end_detail/`
- Other Reports — `/custom_reports/reports/`
- Report Notification — `/custom_reports/report_notifications/`
- Delivery Management — `/orders/delivery_services_list/`

### G. **Management** (massive — broken down below)

**G.1 Configuration**
- Outlet Configuration — `/users/res_new/<outletId>`
- Sub Order Type — `/items/sub_order_type_list/`
- Delivery Distance — `/items/delivery_distance_list/`
- Area/Locality Wise Delivery Charges — `/users/area_wise_delivery_charge_list/`
- Floor Plan — `/users/floor_plan/`
- Email Template Settings — `/users/email_template_setting/`

**G.2 Accounting**
- Payments
  - Payment Information — `/orders/reconcilation_list/`
  - Virtual Wallet — `/users/virtual_wallet_list/`
- Online Order Reconciliation — `/onlines/reconciliation_list_new/`
- GST Information — `/users/gst_information/`
- Bank Details — `/orders/bank_detail_listing/`
- KYC Details — `/orders/kyc_details/`
- Utility Bills — `/paid_services/utility_bill_list/`
- Expense & Withdrawal — `/items/expense_list/`
- Service Payment History — `/orders/invoice_credit_service_list/`
- Loan Information — `/orders/loan_invoice_list/`
- Denomination — `/items/denomination_list/`

**G.3 User Management**
- Biller App — `/users/desktop/`
- Biller Group Management — `/users/biller_group_management/`
- Admin Group Management — `/users/user_group_management/`
- Admin Management — `/users/user_management/`

**G.4 User Logs**
- Online Store Logs — `/logs/online_log_status/1`
- Online Item On/Off Logs — `/logs/online_log_status/2`
- Auto Accept Change Logs — `/logs/auto_accept_log_status/`
- Support Management — `/logs/support_note_list/`
- Notification — `/logs/notifications_list/`
- Menu Trigger Logs — `/settings/zomato_menu_callbacks/`
- Closing Hour Logs — `/logs/closing_hours_logs/`
- Expense Logs — `/logs/expense_logs/`
- Withdrawal Logs — `/logs/withdrawl_logs/`
- Cash Top-Up Logs — `/logs/cashtopup_logs/`

**G.5 Explore Products**
- Marketplace — `/market/services/`
- Marketplace Setting — `/market/settings/`

**G.6 Audit Trail (New)** — `/users/logs_redirect`
**G.7 Data Management (New)** — `/users/logs_redirect/1`
**G.8 Device Mapping** — `/users/desktop_application/`
**G.9 Outlet**
- Add New HO — `/users/resdetails?type=H`
- Add New Kitchen — `/users/resdetails?type=C`

**G.10 Finance (New)** — `/users/finance_redirect`

### H. **CRM**
- Marketing — `/crm/crm_dashboard/`
- Campaign — `/users/send_sms_history/`
- Google Business (Beta)
- Customers — `/users/customer_list/`
- Feedback — `/feedbacks/app_list/`
- Gift Card — `/users/vouchers_list`
- Petpooja Loyalty — `/market/settings/?s_id=81&from=1`
- Ebill Templates — `/users/ebill_template`

### I. **Aggregator Center (New)**
- Swiggy — `/users/helpcenter/2` (likely Zomato/Magicpin/etc. once enabled)

### J. **Quick Links** (user-customizable shortcuts)

### K. **Newly Launched**
- Explore Hyperpure

### L. **Footer / Profile menu**
- Edit Profile — `/users/edit_profile`
- Petpooja Apps — `/users/petpooja_application` (Version 122.0.1 shown)
- Terms & Conditions, Privacy Policy, Logout
- Need Help — support phone 07969 223344

### M. **Top header (right)**
- Bazaar, Reconciliation, Insights, Marketplace, Orders (mega-menu), Suppliers, Menu, Inventory, Reports — these duplicate the sidebar for fast access

---

## 2. AI Assistant — "Ask Me Anything!"

Floating chatbot. Three suggested-prompt categories visible:
- **Ask to generate graphs** — e.g. graph for next week's sales, predict P&L, item-wise P&L
- **Ask anything about your business** — e.g. top-selling items yesterday, last month earnings, channel-wise online sales
- **Get help** — e.g. connect to customer support, add new menu item, create new outlet
- Has chat history grouped by Today / This month etc.
- Input: free-text textbox + Send button

Implication for our build: AI assistant on the dashboard with three-pillar prompts (Analytics / Operations Q&A / Help) — table stakes.

---

## 3. Marketplace / Add-on Ecosystem (visible in sidebar header)

Petpooja sells these as separate **paid products** layered on top of the core POS:

**Products**
- Payroll
- Task (project management)
- Finance
- Marketing Automation
- TRM (Table Reservation Manager)
- Purchase (AI Inventory)

**Operations add-ons**
- Captain Ordering App
- Kitchen Display System (KDS)
- Own Website
- Kiosk

**Integration categories** (each opens a full marketplace tab)
- Dynamic Reports
- Online Orders (Swiggy/Zomato/Magicpin/etc.)
- Accounting (Tally, Zoho Books, etc.)
- Loyalty programs

→ **Implication:** the competing app should either bundle these or expose them as toggleable modules. Petpooja monetizes each one separately.

---

(navigation map saved — proceeding to page-by-page deep audit below)

---

# MODULE AUDIT — DAILY OPERATIONS

## 4. Dashboard (`/users/dashboard`)

### 4.1 Page layout
Top bar (sticky) with restaurant selector "Smokzy", outlet ID 402305, "Ask Me Anything" AI assistant launcher, device-mapping icon, notifications bell, settings cog (profile menu with Edit Profile / Petpooja Apps / T&C / Privacy / Logout), Quick-Links shortcut, "Explore Products" CTA.

Body is a grid of widgets:

| # | Widget | Behavior |
|---|--------|----------|
| 1 | **Data Management Update** banner | Notifies about data-retention policy update; link to opt-out screen |
| 2 | **Sales Statistics** card | Header with date range (default Today, here "26th May"); shows POS sync age (e.g. 22 hours ago), Orders sync age (26 days ago); manual Refresh icon; "Action Center" link opens right-side panel |
| 3 | **Total Sales** | Big number ₹X with breakdown rows: Not paid / Cash / Card / Online / Other |
| 4 | **Total Orders** | Big number + sub-counts: Successful, Complementary, Cancelled. Embedded Highcharts bar chart with hour-of-day buckets |
| 5 | **Dine In** card | Total ₹, # orders, T.T.A (Table Turnaround Avg) in minutes. Expand button to show: Min / Avg / Max order value, Discount, Taxes, Total |
| 6 | **Pick Up** card | Same expanded fields (No. of orders, Min/Avg/Max, Discount, Taxes, Total) |
| 7 | **Delivery** card | Same expanded fields |
| 8 | **Online Orders** card | Total Online Sales ₹, # orders, table per platform (Platforms, Brands, Orders, Revenue, Action) with "View More" link. "Check customer reviews/feedbacks" link goes to marketing.petpooja.com/advertisements |
| 9 | **Leakage** card (date-filtered) | **KOTs:** Cancelled, Modified, Not used in bills, Shifted (each with count). **Bills:** Modified, Re-printed, Waived off (₹) |
| 10 | **Expenses & Withdrawals** card | Total ₹ + "View Breakdown". Breakdown bars: Expenses, Withdrawals, Cash Top up |
| 11 | **Onboarding Progress** | "3/5 steps completed" progress bar with "Complete setup" CTA |
| 12 | **Quick Help** | Outlet ID, name of Point of Contact (Vignesh Chettiar), POC hours, "Contact on WhatsApp" deep-link, 24/7 support phone, Request-a-Call-Back link |
| 13 | **Franchise Conclave 2026** marketing banner | Promo link |
| 14 | **Summary** widget | Tabs Daily / Weekly / Monthly. Daily KPIs: Counter Cash, Cash Sales, Number of Orders, Closing Time (Expected vs Actual). Weekly: dropdown {Overview, Payouts, Weekly Sales, Orders, Expenses} with sub-KPIs. Monthly: dropdown {Finance, Operation, Customer Insights} → Finance KPIs include Monthly Revenue, Monthly Expenses, Net Monthly P&L, Profit Margin, Avg Daily Revenue, Avg Order Value, Avg Order Quantity, Table Turnaround Time |
| 15 | **FSSAI Lic No.** modal | Prompted if missing; single text field + Save |

### 4.2 Date-range filter (used on every dashboard card)
Predefined options: Today, Yesterday, Last 7 Days, Last 30 Days, This Month, Last Month, Custom Range. Cancel / Apply buttons. Each card has its own independent date filter.

### 4.3 Action Center side panel (slides in from right)
Lists *open action items* the restaurant should resolve, e.g.:
- **Items missing description** — table of items + "Clear" / "View Item" actions
- **Tax Configuration** — table of items missing tax mapping (per area); "Ignore now" / Save
- **Item Description** — similar to above; bulk add descriptions
- **Upload Item Image** — bulk image upload prompt
- Footer with support email/phone
Each row has its own Save / Cancel; bottom links: support@petpooja.com, support phone.

### 4.4 Device-mapping modal
- Section "Map device with Smokzy"
- "Map via Unique Code": enter code shown on device, Map button, Scan QR Code button (opens camera or Upload from gallery)
- "Get Code": password field → "Get Code" button generates a secure sync code for that device
- Success toast "POS Mapped Successfully"

### 4.5 "Ask Me Anything" AI assistant
Three suggestion clusters:
- Generate graphs (sales forecast, P&L, item-wise P&L)
- Ask anything (top-selling items, last-month earnings, channel-wise online sales)
- Get help (how to add menu item, create outlet, contact support)
Free-text input + Send. Chat history sidebar grouped by Today / This month.

---

## 5. Live Orders (`/orders/running_orders/`)

Tabs at top:
1. **Running Orders** (default)
2. **Running Tables**

Manual Refresh button.

### 5.1 Running Orders tab
Two stat blocks:
- **Running Orders** — Total Order count, Total Amount ₹. Breakdown rows: Dine in / Pick up / Delivery (each with count + ₹)
- **Pending Orders** — Total Orders, Total Amount. Breakdown: In Preparation, Waiting For Pickup, Out For Delivery (count + ₹ each)

### 5.2 Running Tables tab
Top KPIs: Active Tables count, Estimated Revenue ₹.
Below: empty state "No active tables — Tables will appear here when orders start." When live, this is the floor-plan view that mirrors POS table status (color-coded: free, occupied, KOT printed, bill printed, etc.).

---

## 6. All Orders (`/orders/order_list/`)

Tabs:
1. **Order** (regular)
2. **Advance Order** (`/orders/advance_order_list/`)

Top KPI: Grand Total ₹ for filtered date range. Default range "Last 15 Days Orders".

### 6.1 Filter bar (always visible)
- Start Date / End Date pickers
- **Order Status** dropdown — All / Saved / Printed / Cancelled / Saved + Printed / Complimentary / Sales Return
- Order ID search textbox
- **More Filters** button (expands hidden panel) — see §6.2
- Search button
- Show All button (clears all filters)

### 6.2 More Filters panel
- **Order Type** — All / Delivery / Pick Up / Dine In
- **Sub Order Type** combobox (driven by restaurant's custom sub-types)
- **Customer Name** text
- **Customer Phone** text
- **Payment Type** — All / Cash / Card / UPI / Online / etc.
- **Other Status** — All / Discount / Tax / Bill Updated / Bill Reprinted
- **Grand Total** comparison (operator: =, >, < ) + amount
- **GSTIN** — All / With Gstin / Without Gstin

### 6.3 Toolbar above table
- **Generate Invoice** — bulk-generate invoice for selected orders
- **Action** menu — likely bulk cancel, mark complimentary, etc.
- **Export Excel** — exports filtered list

### 6.4 Order list table
Columns expected (standard for the page): Order ID, Date/Time, Order Type, Customer, Items, Total, Tax, Discount, Net, Payment Mode, Status, Actions (View / Reprint / KOT / Edit / Cancel). Row click opens order detail with full bill, KOTs, item list, payment breakup, audit trail.

### 6.5 Advance Order tab
Same shape, scoped to pre-orders / future-dated orders (reservations + advance bookings).

---

## 7. Online Orders Dashboard (`/onlines/online_dashboard/`)

Header: "Online Orders Activity", default range "Last 5 Days Orders". Top-right link "Aggregator Help Center" goes to `/onlines/online_partner_support/`.

### 7.1 Filter bar
- **Platform / Aggregator** dropdown — All / Swiggy / Zomato / FoodPanda / Magicpin / Dunzo / Thrive / Dotpe / Ubereats etc. (driven by enabled integrations)
- **Record type** — Last 24 Hrs / Get old records
- **Status** — All / multiple status values (Accepted, Rejected, Placed, Food Ready, Picked Up, Delivered, Cancelled etc.)
- **Start Date / End Date** (auto-populated when "Get old records" selected; with separate From/To date pickers)
- **Apply** / **Show All** buttons
- **Export Report** button

### 7.2 Online order list table — columns
1. Order No.
2. Outlet Name (multi-outlet aware)
3. Order From (which aggregator)
4. Order Type
5. Rider Details (delivery partner name + phone)
6. Customer Details (name, phone, address)
7. OTP (delivery hand-off code)
8. Date Time
9. Total ₹
10. Status
11. Actions (Accept / Reject / Mark Food Ready / Print KOT / Re-print / Cancel / Mark Picked Up etc.)

→ **Implication for our build:** every aggregator must be normalized to this single inbox with consistent column shape regardless of source. Rider tracking + OTP must be supported.

### 7.3 Sub-flows expected
- Bulk accept / reject (toggle "Auto Accept" exists in Settings → Auto Accept Change Logs)
- Stock-out toggle from this screen pushes item-off to aggregators
- Cancellation reason capture
- Charge-back / dispute flag

---

## 8. KOT List (`/items/kot_list/`)

History/listing of all KOT (Kitchen Order Ticket) prints.

### 8.1 Filters
- Start Date / End Date
- Order Type: All / Delivery / Pick Up / Dine In
- KOT ID
- Customer Name / Customer Phone
- Table No.
- Status: All / Cancelled / Active / Used In Bill / Shifted
- Modified KOTs filter: All / Modified KOTs
- More Filters (button)
- Search / Show All
- **Export Excel** (top-right)

### 8.2 Table (when populated)
Columns include KOT ID, Order ID linkage, Table No, Items, Quantities, Captain/Steward, Print time, Status, Modification trail, Re-print, Cancel.

---

## 9. Due Payment Settlement (`/orders/due_payment_listing/`)

Manages credit / unpaid bills (regulars who pay later, corporate accounts, etc.).

### 9.1 Settings toggle
"Settle from POS" checkbox — when enabled, due-bill settlement can be done from the on-floor POS app, not just back-office.

### 9.2 Search
- Mobile (validated 10-digit)
- Bill No.
- Search / Reset

### 9.3 Per-row actions
- **Full Settlement** — mark paid in full
- **Received** — record partial payment received
- **Cancel** — void the due record

---

# MODULE AUDIT — REPORTS

## 10. Reports hub (`/custom_reports/reports/`)

Petpooja ships **~80 pre-built reports** organized into 7 tabs. Each report has a star-toggle to mark it Favourite (appears in "Favourite" tab). Each report opens a detail page with date filters, outlet selector, export to Excel/CSV/PDF.

### 10.1 Tabs / categories
1. Favourite
2. All Restaurant Report (multi-outlet roll-up)
3. Order Related Reports
4. Item Related Reports
5. Category Related Reports
6. Customer Related Reports
7. Discount Related Reports
8. Others Reports

### 10.2 Complete report catalog (must replicate every one)

**All Restaurant Report (multi-outlet)**
- All Restaurant Sales Report
- Outlet-Item Wise Report (Row)
- Outlet-Item Wise Report (Column)
- Invoice Report: All Restaurants
- Pax Sales Report: Biller Wise
- Order Report: Sub-Order Wise
- All Restaurant Report: Day Wise
- Order Summary: Corporate Customers
- Cancel Order Report: All Restaurants
- Discount Report
- All Restaurants Sales: Hourly Item Wise
- Category Wise Report: All Restaurants
- Orders Master Report: All Restaurants
- Order Report: Item Wise All Restaurants
- Cancel Order Report: Item Wise All Restaurants
- Locality Wise Report: All Restaurants
- Item Report: Invoice Details
- Item Wise Report: All Restaurants
- Item Wise Report (Brand Wise): All Restaurants
- Online Order Report: All Restaurants
- Discounted Orders: All Restaurants (With Reason)
- Tag Wise Report: All Restaurants
- Advance Order Summary Report

**Order Related**
- POS Collection Report (payments, taxes, category sales)
- Growth Report: Day Wise (orders + expenses + monthly/yearly growth %)
- Orders: Master Report
- Order Print Count Report (re-print monitoring / anti-theft)
- Order Report: After Print Modification (anti-theft)
- Order Report: Payment Wise
- Order Report: All Order Types (online vs dine-in split)
- Sales Report: Billing Counter Wise
- Bill Settlement Report
- After Print Payment Modification Summary
- GSTIN IRN Report (e-invoice IRN reconciliation)
- Advance Order Master Report
- Complimentary Order Report (with reason + customer)
- Executive Sales Report

**Item Related**
- Tax Report: Item Wise
- Item Wise: Sales Report
- Highest Selling Items Report
- Item Sale Report: Hourly Wise
- Item Wise Report With Bill No.
- Addon: Item Wise Report
- Non-Chargeable Item Report (price changed before billing — anti-theft)
- Item Report: Day Wise
- Item Invoice Report: Negative Quantity (non-served items / refunds)
- KOT Report: Negative Quantity
- Variation Report
- Item Report With Customer/Order Details
- Employee Performance (items served by each employee)
- KOT Report: Modifications Of Item
- Commission Summary: Assignee Wise
- Item Report: Group Wise
- Addon Report
- Order Audit: Item Wise (tracks who modified what — anti-theft)
- KOT Itemwise Process Time Report (kitchen prep time per item)
- Item Wise Report: All Restaurants
- Item Report: Brand Wise
- HSN Report
- Item Performance Report (online channel performance)
- Item Price Report: Area Wise
- Item Wise: Addon Report
- West Bengal Excise Report (state-specific compliance txt export)

**Category Related**
- Sales Report: Category Wise
- Sales Report: Group Wise
- Group Wise Report: Per Day Wise
- Tax Bifurcation: Category Wise
- Tax Bifurcation: Group Wise
- Sales Report: Brand Wise
- Brand Wise Report: Per Day Wise
- Tax Bifurcation: Brand Wise
- Sales Report: Tag Wise

**Customer Related**
- Total Customer Spend Report
- Customer Spend Report: Per Invoice (avg spend per head)

**Discount Related**
- Total Coupon Report
- Discount Coupon Consumption Report
- Auto Discount Report
- Bogo Discount Report
- Discounted Orders: Outlet Wise (With Reason)
- Orderwise Co-Funded Discount Summary (merchant vs aggregator split)

**Others**
- Sales Report: Online Platforms
- Captain Performance Report (captain app sales)
- Locality Wise Report: Single Outlet
- Sales Report: Call Center Agent Wise
- Due Payment Report
- Restaurant Timing Summary (breakfast / lunch / dinner sales split)
- Virtual Wallet Report
- Petpooja Loyalty Report
- Sales Report: Biller Wise
- Waiter/Delivery Boy Performance
- Online Order Activity Report (status timeline per order)
- Received Due Payment Report
- Gift Card Transaction Report
- Tip Summary

→ **Implication for our build:** This is the single biggest scope item. We need a report engine, not 80 hand-coded reports. Design pattern: shared data warehouse + parametric report definitions (dimension/metric/filter/group-by/date-grain).

---

## 11. Day End Summary (`/day_end/day_end_detail/`)

Daily roll-up list with one row per calendar day.

### 11.1 Columns
- Created Date
- No. of Orders
- Total ₹
- Actions (View detailed day-end, re-print Z-report, etc.)

### 11.2 Toolbar
- **Export Excel**
- **Action** menu (likely Lock Day / Re-open Day / Cash Variance)
- Start / End Date filter
- Search / Show All
- Pagination footer "Showing 1 to 14 of 14 records"

A clicked row opens the day-end detail (counter-wise cash, denomination, expense, opening/closing balance, sales by type, tax bifurcation, etc.).

---

## 12. Report Notification (`/custom_reports/report_notifications/`)

Schedule any report to be **emailed automatically** on a recurring schedule.

### 12.1 List columns
- Emails (recipient list)
- Reports (which report)
- Time (HH:MM schedule)
- Status (Active / Inactive)
- Created date
- Actions (Edit / Delete / Pause)

### 12.2 Actions
- **Add Report Notification** — opens form to choose report, recipients (multiple emails), frequency (daily/weekly/monthly), time, outlet scope, format (Excel/PDF).
- **Action** menu — bulk activate/deactivate.

---

## 13. Delivery Management (`/orders/delivery_services_list/`)

Tracks third-party delivery rider services (the "Petpooja Delivery" integration layer).

### 13.1 Top KPIs
- **Credit Remaining ₹** (pre-paid wallet with PP)
- **Credit Purchase Till Now ₹**
- **Export Excel**

### 13.2 Filters
- Start / End Date
- **Select Provider** dropdown — All / Adloggs / Borzo / Chowman / Demo Delivery Chain / DoorDash Drive / DunzoB2B / Easymovr / Elemobility / GoYo / Grab / Iwingzy / Jugnoo / Lalamove / NowBike / Opoli Ezip / Parsel / PIDGE / Porter Delivery / Sendi / ShadowFax / Snowch Rider / Sukam Express Rider / Tookan / Uengage / Zomato Xtreme
- Status filter (All)
- Search / Show All

### 13.3 Charts
- Pie chart: own delivery vs third-party split
- Bar chart: Last 7 Days Delivered Orders

→ Petpooja resells / aggregates 25+ delivery providers behind one API. Replicating this is a major business-development effort; competing apps usually pick the top 5 (Porter, Borzo, Dunzo, Shadowfax, Pidge) and add others on demand.

---

# MODULE AUDIT — CRM

## 14. Customers (`/users/customer_list/`)

A banner indicates the "new" customers experience has moved to the Marketing Automation product (paid add-on). The legacy listing still works:

### 14.1 Toolbar
- **Customer Discount Configuration** link
- **Add New Customer** link → form (name, phone, email, address, GSTIN, tags, source)
- **Unlock** (paid-feature unlock)
- **Export** button
- Tabs: **Customers** / **Customer Tags**

### 14.2 Charts
- Pie: Orders with vs without customer (last 7 days)
- Bar: New customers per day (last 7 days)

### 14.3 List filters
- Source ("From Where"): POS / CRM / Import / etc.
- Customer tag dropdown (segments)
- "CRM" campaign-eligibility filter
- More Filters
- Search

### 14.4 Per-row Actions column
View profile, edit, add note, view order history, add to segment, send SMS/WhatsApp, etc.

## 15. CRM → Marketing (`/crm/crm_dashboard/`)

Hub of Petpooja's old marketing module (now deprecated in favor of marketing.petpooja.com). Provides three primary actions:
- **Add Channel** (SMS / WhatsApp / Email integration)
- **Create Segment** (filter customers by spend, recency, location, etc.)
- **Create Campaign** (compose + schedule + audience)
- **View Campaign** (history)

## 16. Campaigns (`/users/send_sms_history/`)

Tabs: **Campaigns** / **SMS Balance** / **WhatsApp Balance** (each with a wallet meter).

### 16.1 Filters
- Schedule From / Schedule To
- Campaign Type
- Channel (SMS / WhatsApp)
- Campaign Name
- Status

### 16.2 Actions
- **Create Campaign** (top right) — wizard: choose channel → segment → template → schedule → confirm/spend
- Standard table with Edit/Pause/Delete actions per row

## 17. Feedback (`/feedbacks/app_list/`)

Tabs:
- **Petpooja Feedback** (default — own-channel feedback)
- **Complaints** (raised by customers / staff)
- **Ratings & Reviews** (online platforms)

Sub-view toggle: **Customer Wise** / **Feedback Wise**.

### 17.1 Filters
From / To dates, Order Type (All / Delivery / Pick Up / Dine In), aggregator/status (All), More Filters, Search/Show All, Export Excel.

### 17.2 KPI: Total feedback count

## 18. Gift Card (`/users/vouchers_list` → marketplace upsell)

Paid add-on (₹4,500 + tax / year shown in the upsell card).
- Create gift cards from dashboard
- Accept payments by gift card
- Configure usage, expiry, binding
- Usage report
(When purchased, full gift-card admin appears in CRM section.)

## 19. Petpooja Loyalty (`/market/settings/?s_id=81&from=1`)

Petpooja's first-party loyalty engine — currently Activated for this account ("122 days left"). Earn/burn point logic; tier configuration; member dashboard; redemption rules.

## 20. Ebill Templates (`/users/ebill_template`)

8 pre-built ebill templates (Template 1 through Template 8); one Applied at a time. Pushed only for outlets running the Electron POS desktop build.

## 21. Email Template Settings (`/users/email_template_setting/`)

Branding for system emails (Ebill + Gift Card delivery).
- Logo upload (JPG/PNG, ≤ 500 KB)
- Header color picker
- Outlet Address (≤ 750 chars), Contact No., Email, Website
- Live preview pane with placeholder body text using "Greetings of the day" template
- Cancel / Save

---

# MODULE AUDIT — ACCOUNTING (Management → Accounting)

## 22. Payment Information (`/orders/reconcilation_list/`)

Master payment-tracking page. **Export Excel** in toolbar.

### 22.1 Filters
- From Date / To Date
- **Status** dropdown — 25+ values incl. Customer Paid, Provider Payment Initiated / In Process / Done, Awaiting Bank Approval (Higher Amount), Petpooja Payment Received / Initiated, Transfer Initiated To Bank, Transferred To Bank, Failed Transaction, Refunded To Customer, Waived Off Paid Service Amount, Manual Adjustment Of Paid Service Amount, Refund Initiated, Return From Bank, Account Mismatch, IFSC Wrong, Account Missing, Account Closed, Dummy/Testing, InstaPay Initiated, Transferred Error, Write Off, Integration Customer Paid, Integration Payment Transferred, Settlement by Aggregator
- **Provider** dropdown — **65+ payment providers** including Mobikwik, Ezetap, EDC Machine, Ruplee, Paytm Wallet, Home Website, UPI, JioMoney, BijliPay, PayTM QR, Virtual, Bharat QR, Sodexo, Pine Labs, UPI QR Code, Worldline, Virtual Wallet API, Mswipe, Menu QR Code, Dineout Pay, Vasy ERP, Petpooja Static QR, Paytm EDC, Zomato Pay, Ewards Pay, PayPhi, Valuedesign, Clover, Razorpay, Swiggy Dineout Pay, Pinelabs EDC, Card Terminal, PhonePe EDC, Razorpay Dynamic QR, Bajaj Pay, Gift Card, EazyDiner, Bajaj EDC, Dejavoo, Zomato QR, Mosambee EDC, Reelo Wallet, Bonushub EDC, BharatPe, PeAR, ICICI EDC, Google Pay, Thrive, GrowthFalcons, Fooza, Eksecond, Myfojo, Tipplr, Bitsila, Uengage (ONDC), Zing, Ybites, Paytm (ONDC), Arroz, Zyapaar, BigByts, Khau Gully, Ownly etc.
- Order ID search
- Search / Show All

→ **Implication:** PG-aggregator status normalization is huge work. Need to design a payment-event state machine that can ingest webhook from any provider and map to a normalized status set.

## 23. Virtual Wallet (`/users/virtual_wallet_list/`)

Customer-level prepaid wallet (top-up + spend ledger). Export button. (Paid add-on; sees activation gate.)

## 24. Online Order Reconciliation (`/onlines/reconciliation_list_new/`)

Gated: "You have not integrated Petpooja with Zomato and Swiggy." When integrated, this matches PoS-recorded aggregator orders against PG/aggregator-reported settlements and surfaces discrepancies (charge-backs, commissions, ad-deductions, promo-funded share, MDR).

## 25. GST Information (`/users/gst_information/`)

Form to update GST registration.
- Do you have GST No? (Yes/No)
- Registered Name For Invoice
- Registered Address For Invoice
- **State** dropdown — all 36 Indian states/UTs
- **City** dropdown — populated by state
- VAT Number (legacy)
- PAN
- CIN
- Location
- Zip Code
- Save Changes

## 26. Bank Details (`/orders/bank_detail_listing/`)

Restaurant Bank Details list (account no, IFSC, branch, beneficiary, primary flag).

## 27. KYC Details (`/orders/kyc_details/`)

Restaurant KYC docs (Aadhaar/PAN of proprietor, FSSAI cert, GST cert, shop establishment, etc.).

## 28. Utility Bill (`/paid_services/utility_bill_list/`)

Manage Utility Bill Operators (electricity, water, gas vendors). Add Operator, Export Excel, search by operator.

## 29. Expense & Withdrawal (`/items/expense_list/`)

- KPI: Grand Total ₹ for filtered range
- **Top 10 Expenses** widget
- **Add Expense** button (form: category, vendor, amount, payment mode, date, attachment, note)
- **Export Excel**
- Filters / search row (date range, expense category, mode, status)

## 30. Service Payment History (`/orders/invoice_credit_service_list/`)

History of Petpooja-billed services (subscription invoices, add-on charges). Export Excel.

## 31. Loan Information (`/orders/loan_invoice_list/`)

Petpooja-Loans (their financing product) invoice history. Export.

## 32. Denomination (`/items/denomination_list/`)

Cash denomination master used at day-close. Add Denomination + Action menu.

---

# MODULE AUDIT — USER MANAGEMENT & PERMISSIONS

## 33. Biller App (`/users/desktop/`)

Manages on-floor POS billers. Sync code generation for each device. Per-biller permissions inherited from Biller Group.

## 34. Biller Group Management (`/users/biller_group_management/`)

Define billing-staff role templates (steward, captain, biller, supervisor). Permission flags scoped to the POS desktop/mobile app. Add / Edit / Delete groups.

## 35. Admin Group Management (`/users/user_group_management/`) — **KEY**

Defines back-office role templates with two giant permission matrices:

### 35.1 Module rights — ~85 distinct toggles (Read / Write or Show)
Item Master · Tax Configuration · Customer Management · KOT Management · Reports · Discount Configuration · Orders And Billing · Point of Sale Configuration · Special Note · Purchase [Inventory] · Recipe Management [Inventory] · Stock Management [Inventory] · Internal Transfer/Sales [Inventory] · Unit Management [Inventory] · Area & Table Management · Request For Purchase · Manual Closing Stock · Category-Wise Taxes · Expense & Withdrawal · Advanced Order Management · Category Management · Item Variation Management · Inventory Report · Dashboard · Running Tables · GST Information · Payment Information · Payment History · Loan Information · Bank Detail · Virtual Wallet · Agreement Information · Delivery Management · Promotional Management · Feedback Management · Distance Management · Utility Bill Management · Desktop Billing Users · Report Notifications · Raw Material Master · Sub Order Type · User Custom Payment · Display System Generated Current Stock · Day End · Online Order Dashboard · Employee Commission · Production Plan · Remove Orders · Change Virtual Wallet User/Card Status · Supplier · Restaurant Analytics · Briefcase Invoice · PO Quantity Edit · Store On/Off · Item On/Off · Wastage · Raw Material Conversion · Common Coupon Discount · Inventory Approval Flow · Edit Inventory Transactional Data · All Restaurant Menu Trigger & Store On/Off · Cancel Order · Show Customer Complaint(s) Web · Rate Card · KYC Details · Add/Update Customer Balance · Virtual Wallet Customer Export · Item Out-of-stock Tracking · Due Payment Settlement From Web · Inventory Setting · Paid/Unpaid In Inventory · Menu Item Stock Management · Configure Profit and Loss · Online Platforms Menu Trigger · Gift Card Listing · Generate Invoice For Old Online Orders · SAP Code Mandatory (Item) · Subpayment Details In Orders Master Report · Ebill Template Settings · Email Template Settings · Exclude Advance/Due Payment From Summary · Multiple Shortcodes (Item) · Finance Dashboard · Manual Available Stock · Allow Complaint Actions

### 35.2 Report rights — ~90 reports each with Show / Export toggles
(See full report list in §10.2)

### 35.3 Form fields
- Name * (text)
- Rights * (checkbox grid with "Select All" master)
- Report Rights * (checkbox grid with "Select All" master)
- Cancel / Save Changes

→ **Implication:** Build role engine that supports tri-state perm (None / Show / Read+Write) and granular Show/Export per report. ~175 permission flags in total.

## 36. Admin Management (`/users/user_management/`)

Lists actual admin users assigned to groups.

### 36.1 Toolbar
- **Add Franchise Owner / Restaurant User**
- **Action** (bulk activate/deactivate)

### 36.2 Filters
- Name, Email
- Type: All / Franchise Owner / Restaurant User
- Status: All / Active / Inactive
- Search / Show All

### 36.3 Columns
Name · Email · Type · Restaurant/Kitchen(s) (multi-outlet scope) · Status · Created Date · Actions (Edit / Reset password / Deactivate / Reassign outlets / Force logout)

---

# MODULE AUDIT — USER LOGS (audit logs)

These 10 log pages are read-only chronological tables of system events:

| Page | Path | Purpose |
|------|------|---------|
| Online Store Logs | `/logs/online_log_status/1` | Storefront on/off toggle history |
| Online Item On/Off Logs | `/logs/online_log_status/2` | Per-item availability toggle |
| Auto Accept Change Logs | `/logs/auto_accept_log_status/` | Auto-accept setting change events |
| Support Management | `/logs/support_note_list/` | Support tickets / call notes |
| Notification | `/logs/notifications_list/` | System notifications history |
| Menu Trigger Logs | `/settings/zomato_menu_callbacks/` | Zomato menu push callbacks (success/fail) |
| Closing Hour Logs | `/logs/closing_hours_logs/` | Restaurant closing-hour changes |
| Expense Logs | `/logs/expense_logs/` | Every expense entry + who/when |
| Withdrawal Logs | `/logs/withdrawl_logs/` | Cash withdrawal entries |
| Cash Top-Up Logs | `/logs/cashtopup_logs/` | Cash drawer top-ups |

Plus the dedicated **Audit Trail** product on `audit.petpooja.com` (separate subdomain reached via `/users/logs_redirect`).

---

# MODULE AUDIT — MANAGEMENT MISC

## 37. Outlet (Add HO / Add Kitchen)

- Add New HO (`/users/resdetails?type=H`) — head-office node for multi-outlet
- Add New Kitchen (`/users/resdetails?type=C`) — central kitchen node

## 38. Device Mapping (`/users/desktop_application/`)

Maps each POS terminal, KDS screen, captain phone, kiosk, etc. to the outlet via unique code or QR.

## 39. Data Management (`/users/logs_redirect/1`)

Policy/data-retention controls — choose whether transactional data is retained or purged after a retention window. (New / GDPR-friendly feature.)

## 40. Finance (`/users/finance_redirect`)

Redirect to `finance.petpooja.com` — a dedicated financial-overview product.

## 41. Marketplace Setting (`/market/settings/`)

Per-add-on configuration screens (one per integration the restaurant has bought).

## 42. Outlet Configuration (`/users/res_new/<outletId>`)

Massive multi-section config screen ("Copy Config" can clone from another outlet). Sections:

1. **Outlet Details** — email, address, logo of outlet
2. **Contact Details** — owner + staff contact for Petpooja to reach
3. **Outlet Timings** — closing hours, lunch/dinner windows, display timing on aggregators
4. **Payment** — currency, payment-type master toggles
5. **Invoice Sequence** — multiple sequences (e.g. per order type, per terminal)
6. **Floor Plan** — table layout designer
7. **Billing Screen → Display** — UI look/values of POS
8. **Set Your Print Logo** — POS receipt logo
9. **Calculations** — invoice math (tax-inclusive vs exclusive, rounding, discount-on-tax)
10. **Connected Services** — integration toggles
11. **Print** — Bill and KOT print settings
12. **Customer** — customer-screen options on POS
13. **Online/Advance Order Configuration** — auto-accept, duration, cancel window
14. **System Setting → Billing System** — internal POS settings
15. **Notification Setting → SMS Configuration** — outbound SMS rules

---

# MODULE AUDIT — MENU MANAGER (`menu.petpooja.com`)

## 43. Menu Hub (`/menus/menu_management`)

Wrapper page with:
- **Manage Menu** button → full menu editor
- **Add Virtual Outlet** — create a parallel "virtual brand" outlet sharing physical kitchen but with its own menu (cloud-kitchen pattern)
- **Add Outlet** — adds a sister outlet

## 44. Full Menu Editor (`/menus/menu_new/all`)

Top horizontal tab strip with these primary tabs:
1. **Items** — item master
2. **Categories** — group items hierarchically
3. **Variants** — size/portion variations (Half/Full, Small/Med/Large)
4. **Addons** — add-on groups (toppings, sides, modifiers)
5. **Tables/Areas** — physical/digital order-areas (driven from Floor Plan)
6. **Taxes** — tax masters (GST 5%, GST 18%, VAT, cess, etc.)
7. **Discounts** — auto-discount rules, BOGO, coupons

### 44.1 Menu variants per channel
Under each Items tab, sub-tabs let you maintain channel-specific overrides:
- **Base Menu** (master)
- **Home Delivery** (Swiggy/Zomato override)
- **Parcel** (takeaway override)
- **Dine In**

→ **Implication:** A single item can have channel-specific price, image, name, availability, and tax. Critical for Indian QSR — Zomato/Swiggy menus are usually 20-30% higher than dine-in.

## 45. Menu Sub-tools (`menu.petpooja.com`)

- **Set Item Commission** — captain/waiter commission per item
- **Special Note** — pre-canned notes (e.g. "Less spicy", "No onion")
- **Schedule Changes** — push menu changes at a future date/time
- **Physical Menu** — print-ready physical menu generator
- **Menu on/off** (`/menus/item_on_off/`) — bulk availability toggle per outlet
- **Multi-Item Images Upload** (`/menus/upload_item_images`) — bulk image upload by SKU code

---

# MODULE AUDIT — INVENTORY (`inventory.petpooja.com`)

## 46. Inventory Dashboard (`/inventory_dashboard/new_inventory_dashboard/`)

Widget grid:
- **Daily Stock Closing Tracker** — month calendar showing days where closing stock was recorded; "Update Accuracy %"; "Stock records are not up to date" alert; days missed counter; **Update Today's Closing** CTA
- **Current Inventory** — Worth of Stocks ₹, raw materials below par-level, raw materials below min-level
- **Low Stock Alert** — list (per category) with stock-out raw materials
- **COGS Breakdown** — cost-of-goods-sold by ingredient; gated until Raw Material + Recipe master populated → "Update Now" CTA
- **Purchase Insights** — Last 7 Days Purchases ₹, Last 7 Days Due Payment ₹, Purchase Price Trend (last 5 bills), Top/Least 5 Suppliers
- **Pending Tasks** — pending POs by stage (Today / 7 Days / This Month / Last Month)
- **Customize** button to rearrange widgets

## 47. Inventory Sidebar (full nav)

| Group | Page | Path |
|-------|------|------|
| Dashboard | Dashboard (new) | `/inventory_dashboard/new_inventory_dashboard` |
| | Dashboard (old) | `/inventories/inventory_dashboard/` |
| Purchase | Stock Purchase | `/inventories/purchase_list/` |
| | Purchase Order | `/inventories/purchase_order_list/` |
| | Purchase Return | `/inventories/purchase_return_list/` |
| Manage Stock | Available Stock | `/inventories/available_stock/` |
| | Closing Stock | `/inventories/new_manual_stock_list/` |
| | Sales | `/inventories/sales_list/` |
| | Transfer | `/inventories/rm_transfer_list/` |
| | Wastage | `/inventories/wastage_list/` |
| | Sales Return | `/inventories/sales_return_list/` |
| Production | Production Master | `/inventory_conversion/raw_material_conversion_list/` |
| | Production Execution | `/inventory_conversion/convert_to_production_list/` |
| | Barcode Generation | `/inventory_barcode/barcode_generation/` |
| Reports | Current Stock | `/inventories/new_it...` (~25 reports) |
| | Stock Summary | (path inferred) |
| | Orderwise Consumption | |
| | Other Reports | |
| Masters | Raw Materials | `/inventories/raw_material_list/` |
| | Item Recipes | `/inventories/inv_recipe_list/` |
| | Suppliers/Third Party | `/inventories/supplier_management/` |
| | Purchase Bill Payments | `/inventories/purchase_payment_list/` |
| | Invoice Templates | `/inventories/inv_invoice_design` |
| | Units | `/inventories/unit_list/all` |
| Settings | Inventory Settings | `/inventories/inventoy_setting/` |
| | Inventory Approval Flow | `/inventories/approving_authority_setting/` |
| | Email Template Setting | `/inventories/email_template_setting/` |

## 48. Stock Purchase (`/inventories/purchase_list/`)

- **Create New** — purchase entry form
- **Scan & Purchase** — barcode-driven receive (point at supplier invoice barcode)
- **Export**, date range, From, Supplier, Invoice No., More Filters, Search/Clear

## 49. Purchase Order

- Create PO → choose supplier → add raw materials with qty/price → optional terms/tax/charges
- States: Draft / Sent / Partially Received / Received / Closed / Cancelled
- Approval flow uses **Inventory Approval Flow** settings

## 50. Recipe Management (`/inventories/inv_recipe_list/`)

- **Create New** — link a menu item to raw materials & qty per portion
- **More Actions** — bulk import/export
- **Auto Consumption** flag — when ON, sales auto-deduct raw materials per recipe (key feature)
- AI Recipe Suggestion — top banner: AI generates recipes from item names

## 51. Inventory Settings (`/inventories/inventoy_setting/`)

Multi-section. Key toggles (Yes/No):
- Auto-consume by recipe (and which order types: Default / Online / Offline / Both)
- POS notification when raw-material reaches At-Par level
- Auto mark item out-of-stock when raw-material < min level
- Kitchen notification when at-par
- Reverse consumption on online-order cancellation (lock after "Food Ready")
- Capture avg purchase price for converted products
- Restrict production if raw stock is negative
- Multiple recipes per raw material group
- Multi-conversion at raw-material level
- Actual production flow (vs theoretical)
- Set specific time slot for production
Plus sub-sections: Purchase Order, Stock Purchase, Sales and Transfer, Closing Related, Other Settings, Ledger Settings, Batchwise Settings, Configuration Logs

## 52. Suppliers (`/inventories/supplier_management/`)

- Create New supplier (name, contact, GST, address, opening balance, payment terms, raw-material catalog)
- Action menu (bulk activate/deactivate/export)
- Files area for supplier docs

## 53. Other inventory features

- **Wastage** entry (date, raw-material, qty, reason, attachment)
- **Transfer** (between outlets / central kitchen → outlet)
- **Sales Return** (return raw-material to supplier)
- **Production Master & Execution** — central-kitchen production runs
- **Barcode Generation** — generate raw-material barcodes
- **Unit Management** — define base units, conversion factors (kg↔g, ltr↔ml, custom)
- **Invoice Templates** — purchase-invoice / GRN print templates
- **Approval Flow** — multi-level signoff on POs above threshold
- **Inventory Email Templates** — emailed PO / GRN / payment reminders

---

# MODULE AUDIT — APPS, DEVICES, AGGREGATOR CENTER

## 54. Petpooja Apps (`/users/petpooja_application`)

**Desktop builds**
- Petpooja POS — Windows, Linux, Mac (Electron-based)
- Net Framework 2.0 install bundle
- Printer Application (for thermal-printer drivers)
- Petpooja POS Local (offline-first build)

**Mobile / Android**
- Petpooja POS (mobile)
- Petpooja Merchant
- Online Order Acceptance
- Captain Ordering
- Token Management
- Feedback Management
- Kitchen Display System (KDS)
- MFR Scanner (mobile barcode scanner)
- Reservations Manager
- Digital Display Application
- iPhone builds for many of the above

→ **Implication:** Competitors must provide at minimum: Desktop POS (Windows/Mac), Captain mobile app, KDS, KOT/printer app, Merchant owner app.

## 55. Aggregator Center (`/users/helpcenter/<n>`)

Per-aggregator help/troubleshooting console. Currently visible: **Swiggy** (will add Zomato/Magicpin/etc. when enabled). Provides:
- Issue type taxonomy (menu sync, stock-out, order failure, payment dispute)
- Ticket history with aggregator
- Macro-resolution actions (refresh menu, retry push)

---

# MODULE AUDIT — MARKETPLACE (`/market/services/`)

Petpooja monetizes most "advanced" features as paid add-ons. The marketplace has two top tabs: **Services** and **Integration**, plus an **Active Subscription** view.

## 56. Services tab (own products)

**POS Plans**
- POS Subscription Renewal (currently Activated — 127 days left)
- Petpooja Growth Plan
- Petpooja Scale Plan
- Petpooja POS + Growth Plan
- Petpooja POS + Scale Plan

**Easy Operations** (each is paid)
- Kitchen Display System (KDS) — Activated for this user
- Smart Stock Manager
- Captain Application
- SMS Service for Home Deliveries
- Self-Order Kiosk
- Token Management
- Petpooja Scan & Order (QR ordering)
- Online Order Reconciliation
- WhatsApp Alerts (1 year free trial)
- Dynamic Reports
- Waiter Calling Device
- Digital Display Application
- Petpooja Payroll
- Petpooja Tasks
- Petpooja Studio (1 year free)
- Petpooja Purchase

**CRM**
- SMS Service
- Gift Card
- Feedback Management
- Link based Feedback Service
- Virtual Wallet
- Petpooja Loyalty (Activated — 122 days left)
- QR Code based Feedback
- Reservation Manager App

**Customer Acquisition**
- Call Center
- WhatsApp CRM
- My Website (own ordering site)

**Petpooja Loan**
- Petpooja Loans (financing)

## 57. Integration tab

**Online Orders**
- Zomato, Swiggy, uEngage, Dotpe, Airmenus, Petpooja Aggregation (ONDC), Muncho, Zomato Hyperpure, Other Aggregators

**Order Delivery**
- uEngage Flash, Shadowfax, Pidge (plus 25+ delivery providers listed in §13.2)

**Accounting**
- Tally Integration, Data Lake, e-Invoice, Zoho Books, Busy Accounting

**Customer Updates**
- Green Receipt (paperless bills)

**Loyalty Programs**
- Bingage (free trial), Reelo (free trial), eWards, uEngage Prism, CKKA, 1Loyalty AI, BillFree, Trozo Loyalty, MRP Shop

**Payments**
- Razorpay, Bijlipay, Axis Bank (plus the 65+ providers visible in Payment Information §22)

**Hardware**
- Essae, Posbank, Posiflex, iMin, Lenovo, Ira

---

# COMPETITIVE / GAP NOTES

## What competitors should differentiate on

1. **Bundle vs unbundle pricing.** Petpooja sells everything à la carte; an all-inclusive subscription is a clear selling point for SMB cafés/clubs.
2. **Unified data model.** Petpooja still splits Menu, Inventory, Billing into separate subdomains with their own SPAs and even versions ("Old Dashboard / New Dashboard"). A single-app, single-data-model experience would be smoother.
3. **Modern report engine.** 80 hand-crafted reports are hard to maintain and slow to add new ones. A self-serve report builder (dimensions × metrics × filters) would leap-frog this.
4. **AI built in.** "Ask Me Anything" is a single chat widget. Embedding LLM Q&A inside every screen (e.g. "explain this variance", "draft a SMS campaign for these customers") is the obvious next layer.
5. **Native HQ console for chains.** Petpooja's HO / Franchise console is bolted on (`Add New HO`, `Add New Kitchen` are buried in Management → Outlet). A chain-first design with consolidated P&L, central menu, central inventory, and franchise royalty settlement is a clear gap.
6. **Faster offline POS.** Petpooja runs an Electron app; restaurants complain about sync lag. A native (Tauri / Flutter desktop / .NET) build with deterministic offline-first sync would resonate.
7. **Payment-state machine.** 25+ statuses × 65+ providers is a maintenance nightmare in Petpooja. A normalized event-sourced state machine is buildable as a clean v1.

(end of audit notebook)



