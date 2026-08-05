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

## Cursor Cloud specific instructions

Standard commands live in `package.json` scripts (`dev`, `build`, `start`, `lint`, `create-admin`). Notes below are the non-obvious bits for this VM.

- **MongoDB is required and is not managed by systemd.** MongoDB Community 8.0 is installed, but nothing auto-starts it. Start it before running the app or the `create-admin` script (both connect on import), e.g. in a tmux session: `mongod --dbpath /var/lib/mongodb --bind_ip 127.0.0.1 --port 27017`. Verify with `mongosh --quiet --eval 'db.runCommand({ ping: 1 })'`. `lib/db.js` throws at import time if `MONGODB_URI` is unset, and the DB name comes from the URI path (`/stockly`).
- **`.env` is git-ignored and already present** at `/workspace/.env` (`MONGODB_URI=mongodb://127.0.0.1:27017/stockly`, `NEXT_PUBLIC_BASE_URL=http://localhost:3000`, empty `UPLOADTHING_TOKEN`). `UPLOADTHING_TOKEN` is declared but not yet used in code.
- **Dev server:** `pnpm dev` serves on port 3000 (Turbopack). Root `/` redirects to `/login`; public sign-up is disabled.
- **Seeding accounts:** run `pnpm create-admin <email> <password> [name]` to create/promote an admin (needs Mongo running). A seeded admin already exists: `admin@stockly.test` / `admin1234`. Regular users are created by the admin from `/admin/accounts`.
- **Tests:** there is no `test` script; run the built-in Node runner with env loaded: `node --env-file=.env --test`.
- **App gotcha:** creating a product (`/admin/products`) requires an existing category first (`/admin/categories`).
