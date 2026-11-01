# Pig Ledger

Pig Ledger is a mobile-first farm management and accounting app for pig farms. It combines financial records with batch operations, feed inventory, animal monitoring, customers, suppliers, payments, and multi-farm access.

## Features

- **Dashboard and reports** — expense, sales revenue, profit, date filters, batch reports, CSV export, and projections.
- **Expenses and sales** — add, edit, and delete records; assign transactions to batches and link suppliers or customers.
- **Batch management** — create batches, track status, and compare projections with linked transactions.
- **Farm operations** — population movements, feed products, inventory movements, and actual feed consumption.
- **Animal monitoring** — weight measurements, average daily gain, feed conversion metrics when the source data is valid, and health/treatment records.
- **Business management** — customers, suppliers, partial sale payments, cash received, and outstanding balances.
- **Multiple farms** — farm switching, invitation codes, and owner/manager/staff/viewer roles.
- **Offline-first workflow** — local IndexedDB records and queued synchronization with Supabase.
- **Installable PWA** — phone-friendly navigation and a public static-asset cache. Authenticated pages and records are not cached by the service worker.

## Technology

- Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS
- Supabase Auth, PostgreSQL, Row Level Security, and RPC functions
- IndexedDB for per-account, per-farm offline storage
- Node.js built-in test runner

## Local setup

Use Node.js 20.9 or newer (Node.js 24 is used for the local release verification).

1. Install dependencies:

   ```powershell
   cd PigLedger
   npm ci
   ```

2. Create `.env.local` from `.env.local.example` and set the Supabase project URL and public/publishable key. Never commit `.env.local` or service-role/database credentials.

3. Start the development server:

   ```powershell
   npm run dev
   ```

   Open http://localhost:3000.

## Tests and production build

```powershell
npm run test:unit
npm run test:offline
npm run test:categories
npm run build
npm start
```

The production build runs the complete unit suite before compiling the Next.js application.

## Database migrations

The migration files in `supabase/migrations/` describe the schema evolution. Apply them to the intended Supabase project in dependency order:

1. `phase1_security_hardening`
2. `phase2_farm_operations_foundation`
3. `phase3_animal_monitoring`
4. `phase4_customers_suppliers_payments`
5. `phase4_multi_farm_memberships`
6. `phase4_multi_farm_hardening`

The existing base migrations for batches and reports are already part of the original deployment. Review migration history before applying anything to an existing database. Do not run `supabase/schema.sql` against a live database as a reset or replacement for incremental migrations.

These migrations add tables, indexes, constraints, functions, triggers, and farm-scoped access policies. They are intended to preserve existing transaction records. Always verify the target project and take a recoverable backup before a production schema change.

## Deployment

The Vercel project is connected to this GitHub repository and builds from the `PigLedger/` directory. Configure these environment variables for the required Vercel environments:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or the Supabase publishable key used by the project)

Only public client keys belong in `NEXT_PUBLIC_*` variables. Never expose a Supabase service-role key or database password to the browser.

Use a pull request into `main` for production releases. Confirm the Vercel preview build before merging.

## Data semantics and safety

- Sales revenue is not the same as cash received. Receipts are stored separately as payments.
- Feed purchased is not the same as feed consumed. Inventory movements and consumption are separate ledgers.
- Growth and FCR metrics remain unavailable when required source records are missing or population changed between measurements.
- Offline records are scoped by account and selected farm. Legacy browser records require explicit recovery confirmation.
- Backup import is a validated merge; it does not delete existing ledger records.
