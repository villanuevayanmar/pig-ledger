# Pig Ledger Development Assessment

**Assessment date:** 2026-10-31  
**Repository:** `villanuevayanmar/pig-ledger`  
**Default branch inspected:** `main`  
**Inspected commit:** `c09cf39174e5bd3560672bb009f84aebed28fb41`  
**Application root:** `PigLedger/`

## Executive summary

Pig Ledger is an existing, compact Next.js App Router application with Supabase authentication, a single-farm ledger model, batches, expense and sales entry, a client-side report, a local IndexedDB copy, and a queued sync endpoint. It is not a blank project and should be extended in place.

The current implementation is a useful financial-ledger foundation, but it is not yet a complete farm-management system. The most important risks to resolve before adding modules are synchronization correctness, account-scoped local persistence, restore safety, and the distinction between feed purchases and feed consumption. These affect whether future population, inventory, payments, and health modules can safely rely on current records.

Work for this upgrade will use a separate development branch. No production database migration, data deletion, or production deployment is authorized by this assessment.

## 1. Existing architecture and features

### Runtime and libraries

- Next.js 14 App Router, React 18, TypeScript, Tailwind CSS.
- Supabase JS/SSR clients for email/password authentication and PostgreSQL access.
- PostgreSQL tables currently in use: `farms`, `batches`, `expenses`, and `sales`.
- IndexedDB object store `ledger`, currently using one key: `ledger-v1`.
- A service worker at `public/sw.js`, install prompt, manifest, and mobile bottom navigation.
- Vercel configuration is in `PigLedger/vercel.json`; the GitHub repository is connected to Vercel.

### Existing pages

| Route | Current purpose |
|---|---|
| `/` | Overview: expense/sales/profit summary, recent activity, weight sold and pigs sold |
| `/transactions` | Tabs for expense and sales entry |
| `/expenses` | Expense entry/register |
| `/sales` | Sales entry/register |
| `/batches` | Create batch, set status, edit financial projection, view linked actual totals |
| `/reports` | Batch/all-visible-record report and browser print |
| `/settings` | Single farm name and manually entered pig count |
| `/login` | Email/password sign-in and account creation |
| `/fattening` | Redirect to `/batches` |

### Existing implemented capabilities

- Authentication middleware protects application routes; the sync API separately checks for a signed-in user.
- Expenses and sales can be added locally, queued, and synchronized.
- Batches can be created, updated through status/projection operations, and linked to expenses and sales.
- Financial totals are centralized in `lib/totals.ts`.
- Feed expense lines can store kilograms per purchase unit.
- The report supports a batch selector, feed/expense/sales summaries, and browser print.
- A five-step onboarding tutorial is shown to accounts without its completion metadata.
- RLS is enabled on the four existing public tables. The current policies primarily authorize rows by `user_id`, with batch-to-farm ownership checks.

## 2. Database inspection

The connected project contains the four tables below. RLS is enabled on each table.

| Table | Current row count | Relevant existing data |
|---|---:|---|
| `farms` | 1 | Farm identity, name, manually maintained pig count, owner |
| `batches` | 0 | Farm/user ownership, name, start/target dates, initial heads, status, projection, soft-delete timestamp |
| `expenses` | 0 | Date, category, description, quantity, unit, price, line total, batch, expense type, item name, kg per unit |
| `sales` | 0 | Date, buyer, heads, weight, price/kg, gross, batch |

No production table or record was changed during this assessment.

### Schema gaps

There are no tables yet for population movements, feed products/inventory movements, feed consumption, weight records, health/treatment records, customers, suppliers, payments, farm memberships/roles, notifications, or audit events.

### Security and performance advisor findings

The current Supabase advisor reports:

- A warning that `public.link_farm_records()` is a `SECURITY DEFINER` function executable by `anon` and `authenticated`. Its execution permissions and trigger-only purpose need a reviewed security migration.
- Leaked-password protection is disabled in Supabase Auth; this is a project setting, not a code-only change.
- RLS policies repeatedly call `auth.uid()` in expressions; Supabase recommends wrapping stable auth calls in a scalar subquery for query-plan efficiency.
- `batches.user_id` has no covering index.
- Several existing indexes are reported unused. Since the current transaction tables are empty, do not drop indexes merely because they are unused now.

These findings should be handled in a dedicated security/database phase. Production settings and schema remain untouched pending approval.

## 3. Bugs and reliability risks found

### Critical: sync is not idempotent for expense/sale creation

The client creates local IDs such as `local-exp-...` and `local-sale-...`, but `/api/sync` does not send those IDs to PostgreSQL. PostgreSQL creates a new UUID on each insert. If the server commits an insert but the response is lost before the client removes the pending operation, a retry can create a duplicate expense or sale.

### Critical: deleting a not-yet-synchronized record can leave an orphaned server row

The client queues an `add-expense` or `add-sale`, then queues a delete operation using the local ID. The sync route skips remote deletes for IDs beginning with `local-`. Because the create operation does not persist the local ID in PostgreSQL, the queued delete cannot identify the inserted row. The correct behavior is to cancel a still-pending local create rather than enqueue a remote delete.

### High: failed sync operations are not clearly reported

The sync endpoint can return `ok: true` with a warning and a partial `completedOps` count. The queue is partly retained, but the UI treats the call as a successful sync and does not surface the server warning or identify the failed operation. Unknown operation kinds can also fall through and be counted as applied.

### High: local IndexedDB is not physically partitioned by account/farm

There is one database key for the ledger. The sign-in form tracks the last owner in localStorage and resets the local ledger when it detects an account switch, but that is a single shared copy rather than user/farm partitioning. Storage failures are swallowed, so the UI may continue without confirming that the reset or save succeeded. This is a risk for pending records and account isolation.

### High: restore is destructive before it is fully validated

`importAll` deletes existing expense and sales rows before completing full payload validation and before both replacement inserts have succeeded. The delete errors are ignored, and a failure partway through restoration can leave a partially replaced ledger. The backup format also omits batches and does not fully preserve newer expense fields such as batch assignment, expense type, item name, and kilograms per unit. The restore component is present but is not currently rendered by `SettingsClient`.

### High: purchases are presented as feed used

The Reports page calculates kilograms from feed purchase quantity multiplied by kilograms per unit and labels that value as feed used. No feed consumption movement exists. The current value can only mean estimated/purchased feed weight, not actual consumption. Feed inventory and consumption need separate records before FCR or actual consumption reports can be correct.

### High: archive filtering hides historical report data

The server pull excludes archived batches, and the local merge also filters them. The report's all-batches view only includes transactions whose batch remains in the visible batch list, so transactions attached to archived batches can disappear from the all-batch report. Archives should be hidden from active selectors while remaining available to historical reports.

### Medium: editing and audit history are absent

Expense and sales interfaces support add and delete, but not edit, search, filtering, sorting, or activity history. The database has no audit-event table.

### Medium: population and financial semantics are incomplete

- `farm.pigCount` is manually editable and is not derived from batch population movements or pig sales.
- Batch `initialHeads` is stored but not reduced by sale head counts or mortality events.
- The dashboard's `totalWeight` means recorded sold weight, not live herd weight.
- `costPerKg` currently divides all expenses by recorded sold weight; it is not a feed conversion metric or a measured cost per kg of liveweight gain.
- Per-sale "net proceeds" allocates total expenses by sale weight. It is an allocation estimate, not a payment receipt or a fully traceable sale margin.
- No payment ledger exists, so gross sales must not be described as cash collected.
- Some expense categories are classified into report sections using string checks; this should become a centralized typed category/type mapping.

### Medium: tests are not currently runnable

`package.json` defines `test:offline` and `test:categories`, but the referenced `_offlinetest.mjs` and `_categorytest.mjs` files are absent from the repository tree. There is no lint or typecheck script and no automated test framework/configuration. The Vercel check on the inspected commit is green, but that is not a substitute for unit and integration coverage.

### Medium: PWA cache policy needs tightening

The service worker bypasses `/api/` and Supabase-hosted requests, but it otherwise caches successful same-origin GET responses, including authenticated page responses. Cache keys do not separate users. A user switch or offline navigation could therefore expose stale page content. The PWA must cache only an explicitly allowlisted non-private app shell/static assets; authenticated data must remain in account-scoped IndexedDB and must not be cached as shared page responses.

## 4. Missing requirements mapped to existing foundation

| Requested area | Existing status | Main dependency |
|---|---|---|
| Advanced dashboard/charts/date filters | Partial summary only | Correct, reusable query/calculation layer |
| Population and mortality | Missing | Population movement ledger + availability checks |
| Feed inventory and consumption | Purchase fields only; no stock ledger | Feed catalog + inventory movements + consumption |
| Batch history and performance | Basic batch/projection | Population, inventory, weight, health, finance links |
| Weight/growth/FCR | Missing | Weight records + feed consumption |
| Expense edit/search/filter/custom categories | Add/delete only | Validation, update operation, category catalog, audit events |
| Medicine/health | Expense category only | Health/treatment records, schedules |
| Customers/suppliers | Buyer text only | Farm-scoped directory entities |
| Payments/receivables | Missing | Sales terms + payment allocation ledger |
| Financial reports | Basic batch/all report | Date filters, archived history, payments, stock movements, population |
| Projected vs actual | Basic projection | Extend projection fields and consistent actual calculations |
| Multiple farms/memberships/roles | Single farm per user | Farm memberships, role model, RLS redesign |
| Activity history | Missing | Append-only audit events |
| Offline/conflict handling | Basic pending queue | Idempotency, durable errors, scoped stores, version/conflict policy |
| Backup/restore | Incomplete code, hidden UI | Versioned backup contract + validated staged/transactional restore |
| Notifications/reminders | Missing | Schedules, notification preferences, delivery constraints |
| UI/UX | Simple mobile-first shell | Incremental workflows and reusable components |

## 5. Implementation order and guardrails

### Phase 1 — Existing system reliability

1. Add automated calculation tests and restore test scripts that currently reference missing files.
2. Make local persistence errors visible and prevent fallback-to-empty behavior from silently appearing as a valid empty ledger.
3. Partition IndexedDB by authenticated user and farm; provide a safe migration path for the existing `ledger-v1` copy.
4. Make create operations idempotent with stable UUIDs and conflict-safe inserts.
5. Cancel pending creates when a user deletes an unsynchronized record.
6. Return structured sync results and surface failed operations; reject unknown operation kinds.
7. Add expense/sale editing and server-side validation while preserving existing IDs and auditability.
8. Redesign backup validation/restore so the old ledger is not deleted before a valid, complete replacement is ready. Keep a backward-compatible reader for version-1 backups.
9. Tighten the service worker to avoid caching authenticated responses.

### Phase 2 — Farm operations

Design and implement population movements, mortality, feed products, feed purchase/inventory movements, feed consumption, stock adjustments, and richer batch history. Purchases and consumption must remain separate. Add database migrations and RLS in development first; do not apply them to production without approval.

### Phase 3 — Animal monitoring

Add batch weight measurements, gain/ADG, actual feed-consumption-based FCR, treatment/vaccination records, and reminders. Show unavailable metrics when source records are insufficient.

### Phase 4 — Business management

Add customers, suppliers, sale settlement fields, partial payments, receivables, and multiple farms with membership roles. Enforce roles with database policies, not presentation-only checks.

### Phase 5 — Reports and analytics

Build charts and complete reports using the same tested domain calculations as the dashboard and batch views. Keep sales revenue distinct from cash received and feed purchases distinct from feed consumed. Add CSV exports and date/farm/batch filters.

### Phase 6 — Final polish

Improve accessibility, mobile workflows, loading/empty/error states, dark mode if useful, performance, advisor findings, and end-to-end coverage.

## 6. Implementation and release controls

- Development changes will be committed only to a development branch and tested before merge.
- Existing user records must be preserved. No table truncation, user deletion, or replacement restore is permitted without a validated backup and an explicit user action.
- No production schema migration, production database setting change, destructive cleanup, merge to the production branch, or production deployment will be performed without the user's explicit approval.
- Proposed migrations will be reviewed for RLS, indexes, foreign keys, rollback/compatibility strategy, and data backfill behavior before approval is requested.
- A feature will be marked complete only after its implementation and relevant tests have actually run.

## 7. Current verification limits

The GitHub repository tree and source files were inspected directly. The Supabase schema, RLS policies, current row counts, and security/performance advisor results were read without modifying the database. The Vercel status check for the inspected `main` commit reported success.

The authorized Desktop Commander device was offline during this assessment, so a fresh local install, lint, TypeScript run, production build, browser test, and local IndexedDB/offline scenario could not be executed. This must be corrected before accepting Phase 1 changes.
