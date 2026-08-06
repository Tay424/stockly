<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Stockly

A simple stock management system with two roles:

- **Admin** — creates stock items and updates stock counts.
- **User** — makes sales. Each sale deducts from the stock of the item sold.

## Auth

- Use [Better Auth](https://better-auth.com).
- The admin account is created via a script.
- Users are created by the admin, who then sends them their email and password directly.

## UI

- Use shadcn `sonner` for toasts.
- Match the look and feel of `~/Documents/running-projects/utashiamdin` — sidebar, tables, filters, and colors.

## Environment

`.env` already contains:

- `NEXT_PUBLIC_BASE_URL`
- `MONGODB_URI`
- `UPLOADTHING_TOKEN`

## Product roadmap (frozen)

**Goal:** sales/revenue integrity and accuracy — clear stock movements, highlight discrepancies, end-of-day stock + sales (+ later expenses) can tally. Enterprise patterns without overkill.

**Build order is strict:** **1a → 1b → 1c → 2**. Do not start charts (1c) until integrity (1b) works. Do not start expenses (2) until Phase 1 is done.

| Phase | Status | Scope |
|-------|--------|--------|
| **1a** | Done (branch `cursor/phase-1a-sell-on-sales-95a3`) | Sell on Sales; speed-tuned form; hide out-of-stock; Dashboard = overview |
| **1b** | **Next** | Stock movement ledger; void request → admin execute; Today integrity view |
| **1c** | Blocked on 1b | Charts: attendant = me; admin = shop + per person |
| **2** | Later | Expense apply → approve / send-back; receipt; pending out of totals; in-app + email |

### Phase 1a — Sell on Sales (done)

- Attendants record sales on `/dashboard/sales` (not Dashboard).
- Dashboard: stats + link to Sales only (charts placeholder later).
- One sale at a time as it happens (not end-of-day batch).
- Speed UX: large controls, qty +/− steppers, keep product selected after success, reset qty to 1.
- Out-of-stock: hidden from picker (`listSellableProducts` / `stock > 0`); qty > available still hard-blocked server-side.
- Online only (no offline queue).

### Phase 1b — Integrity + voids (next)

- **Stock movement ledger** as source of truth. Every stock change writes a row: `sale`, `void`, `admin_adjust` (who / when / why / ref). Admin product stock edits must write ledger rows with a reason — no silent stock edits.
- **Void flow:** attendant requests void (reason) → admin executes (restores stock, marks sale voided, audit trail). No silent sale edits by attendants.
- **Void limits:** attendant can request void only for **same-day** sales; **one open request per sale**; admin can void **any age**.
- **Admin integrity UI:** Today default — clear stock movements vs sales; highlight discrepancies so products aren’t “left uncatered for.” Week/month filters later; no custom date-range builder in v1.
- Suggested shape: extend `sale` with `status: recorded | void_requested | voided` + void metadata; new `stock_movement` collection.

### Phase 1c — Charts (after 1b)

- **Attendant:** my performance (revenue/units; Today-focused).
- **Admin:** shop totals + per-attendant breakdown.
- Integrity/discrepancy view from 1b stays primary; trend charts are secondary.

### Phase 2 — Expense applications + receipts

- Attendants **apply** (status `pending`); admins may log expenses **direct = auto-approved** (rent, suppliers).
- Statuses: `pending` → `changes_requested` (attendant edits & resubmits same record) → `approved`.
- Attendant **cannot** edit while `pending`; can edit only when `changes_requested`; `approved` is frozen.
- Pending: visible in pending queue + filterable on Expenses list; **never** in monthly accounts/profit until `approved`.
- Admin UX: pending queue + Expenses table status filter; detail with **receipt zoom**; Approve or Request changes (+ reason).
- Receipt: **required** for attendant apps; one image JPEG/PNG/WebP (phone OK); PDF later. Use UploadThing (`UPLOADTHING_TOKEN`).
- Categories: **fixed list** + optional notes (e.g. Transport, Stock purchase, Utilities, Packaging, Misc — exact list at implement time).
- Notifications: in-app status badges **+ email** on approved / changes requested. Email stays in Phase 2; in-app still ships if mail provider secrets aren’t ready yet.
- **Legacy:** one-time migrate existing expenses → `approved` (no receipt required for legacy).

### Decided rules (quick reference)

| Topic | Decision |
|-------|----------|
| Where to sell | Sales tab; Dashboard = overview |
| Sale granularity | Per transaction as it happens |
| Sale edits | No silent edits; void request → admin executes |
| Void window | Attendant same-day; admin any age; one open request/sale |
| Stock truth | Full movement ledger (sale/void/admin adjust) |
| Charts audience | Both roles; integrity before vanity charts |
| Chart time default | Today |
| Expenses create | Attendant apply; admin direct auto-approved |
| Pending in books | Never until approved |
| Reject style | Send back / changes requested (same application) |
| Receipt | Required; 1× JPEG/PNG/WebP |
| Expense categories | Fixed list + notes |
| Email | Phase 2; don’t block in-app on missing SMTP |

### Explicitly out of scope (for these phases)

- Offline sync queue
- Attendant editing sales or approved expenses
- PDF receipts (later)
- Custom date-range builder
- Push notifications
- Admin-managed expense category CRUD (fixed list first)

### Continue here

Next implementation chat should: checkout / continue from branch with this roadmap (or merge Phase 1a first), then implement **Phase 1b only**. Read `app/dashboard/sales/` for the current sell flow and `lib/catalog.js` for `recordSale` / stock updates.
