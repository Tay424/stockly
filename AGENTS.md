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
- The admin account is created via a script (`pnpm create-admin`).
- Admins create attendant accounts from **Users** (`/admin/users`). The app generates a temporary password for the admin to share. On first sign-in the attendant is forced to `/change-password` to pick their own password before reaching the dashboard.
- Public sign-up is disabled.

## UI

- Use shadcn `sonner` for toasts.
- Match the look and feel of `~/Documents/running-projects/utashiamdin` — sidebar, tables, filters, and colors.

## Environment

`.env` already contains:

- `NEXT_PUBLIC_BASE_URL`
- `MONGODB_URI`
- `UPLOADTHING_TOKEN`
