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

Attendants record sales on **Sales** (`/dashboard/sales`); **Dashboard** is overview only. Build order is strict: **1a → 1b → 1c → 2**.

| Phase | Scope |
|-------|--------|
| **1a** (current) | Sell CTA on Sales; speed-tuned online form; hide out-of-stock; Dashboard = stats overview |
| **1b** | Stock movement ledger (sale / void / admin adjust); attendant same-day void *request*; admin executes void; Today integrity view |
| **1c** | Charts (attendant = me; admin = shop + per person) — only after 1b |
| **2** | Expense apply → approve / send-back; receipt image; pending excluded from totals; in-app + email (email may wait on provider secrets) |

Key rules already decided: one sale at a time; no silent sale edits; one open void request per sale; admin can void any age; legacy expenses migrate to `approved` in Phase 2.
