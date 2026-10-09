# 🐷 Pig Farm Ledger (Full-Stack)

Livestock accounting for piggery: **feed expenses, sales, and profit tracking**.
Built with **Next.js (App Router) + React + TypeScript + Tailwind CSS + Supabase**.

## Features
- 📱 **Phone-first** — big touch targets, bottom tab nav, no scrolling tables
- 💸 Expenses ledger (Booster, Pre-Starter, Starter, Grower, Finisher, Gestating, Lactating, Vitamins / Medicine, Payment for technicians, Other Feed, Miscellaneous, Other) with
  **auto line totals + grand total** and **red discrepancy highlighting**
- 💰 Sales ledger with **auto gross sales** (weight × price/kg) and per-sale **net revenue**
- 📊 Profit summary: total expenses, gross sales, net income, **profit per pig**,
  cost per pig, cost per kg, expenses by category
- 📴 **Offline-first** — saves on the phone with no signal, syncs to Supabase later
- 📲 **Installable (PWA)** — Add to Home Screen, opens like an app
- 💾 JSON backup download / restore, autosaved in Supabase

## How offline mode works (for the farm)
1. No signal? Add expenses/sales anyway — they save instantly on the phone (IndexedDB).
2. Unsynced rows show **⏳ not synced**. The top pill shows **🟠 Offline** or **🟢 Online + N to sync**.
3. When internet returns, the app auto-syncs (or tap the green pill). `POST /api/sync`
   replays the queue into Supabase, then the phone downloads the fresh copy.
4. Last-write-wins: if two phones edit while offline, both rows are kept when they sync.
   If you need strict no-conflict, use one phone as the recorder.
5. Install: open the Vercel link → Android: **Install** banner → iPhone: **Share → Add to Home Screen**.

## What to do (step by step)

> ✅ Your database is already live and connected.

### 1. Install dependencies (Windows)
```bash
cd "WEB CODE\PigLedger"
npm.cmd install
```
Use `npm.cmd` (not `npm`) in VS Code PowerShell. If your terminal is stuck,
close VS Code and open a fresh terminal.

### 2. Supabase database — DONE ✅
Your project `https://argkovtbweziboyfwqgu.supabase.co` already responds and the
`farms` table already returns a row. If you ever need to recreate tables:
1. Go to https://supabase.com → open your project
2. Open **SQL Editor** → **New query**
3. Paste the whole contents of `supabase/schema.sql` → **Run**

### 3. Connect your app to Supabase — DONE ✅
`.env.local` is already created with:
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY-HERE
```
New `sb_publishable_...` keys need `@supabase/ssr 0.7.0` + `@supabase/supabase-js
2.50.0` (already set in `package.json`). The old `eyJhbGci...` JWT key also works.

### 4. Run it
```bash
npm.cmd run dev
```
Open http://localhost:3000 on your phone or computer.

### 5. Deploy online (shareable link for phones) 🌐

**Easiest: Vercel (free)**
1. Create a free account at https://github.com, then https://vercel.com
   (log in to Vercel with GitHub).
2. Upload this `PigLedger` folder to a new GitHub repo
   (e.g. `pig-ledger`). Skip `node_modules`, `.next`, `.env.local`,
   `*.log` — they are already in `.gitignore`.
3. Vercel → **Add New → Project → Import** your repo. Keep defaults:
   Framework = Next.js, Build = `npm run build`.
4. Before pressing Deploy: **Environment Variables** → add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://argkovtbweziboyfwqgu.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your `sb_publishable_...` key
   (Vercel → Project → Settings → Environment Variables if you skip it).
5. **Deploy** → you get `https://pig-ledger-xxx.vercel.app`.
   Open it on any phone/computer — same Supabase data everywhere.

**Local production test (same as Vercel runs)**
```bash
npm.cmd run build
npm.cmd start
```
Then open http://localhost:3000.

> Online mode needs internet. For farm use with no signal, use the
> `WEB CODE/Pig/index.html` offline copy, or ask for Track B (PWA offline).

## App structure
```
app/
  layout.tsx        Root layout + header + bottom nav + PWA
  manifest.ts       Installable app manifest (Add to Home Screen)
  page.tsx          Home — offline-first dashboard (HomeClient)
  expenses/page.tsx Expenses — offline-first (ExpensesClient)
  sales/page.tsx    Sales — offline-first (SalesClient)
  settings/page.tsx Farm setup — offline-first (SettingsClient)
  api/sync/route.ts POST offline queue -> Supabase (last-write-wins)
  actions.ts        Server Actions (backup restore / clear)
components/
  Nav.tsx           Mobile bottom tab bar
  SummaryCards.tsx  The 4 big numbers (Expenses / Sales / Profit / Per pig)
  SyncStatus.tsx    🟠 Offline / 🟢 Online + pending pill, auto-sync
  HomeClient.tsx    Offline home: local ledger + totals + quick add links
  ExpensesClient.tsx Offline expenses: instant save + queue + sync
  SalesClient.tsx   Offline sales: instant save + queue + sync
  SettingsClient.tsx Offline farm name + pigs (syncs later)
  InstallPrompt.tsx 📲 Install banner (Android prompt / iPhone hint)
  SwRegister.tsx    Registers /sw.js offline page shell
  SetupGuide.tsx    Shown when env vars are missing
lib/
  local-store.ts    IndexedDB phone copy + pending queue (offline core)
  supabase/         Browser + server Supabase clients (@supabase/ssr)
  data.ts           Server reads (farms, expenses, sales) + row mapping
  totals.ts         Single source of truth for all math (works offline)
  format.ts         Peso / kg formatting helpers
  types.ts          Shared TypeScript types
public/
  sw.js             Offline page shell (never caches API / Supabase)
  icons/icon-512.svg App icon (SVG, no build step needed)
supabase/schema.sql Database schema — run once in SQL Editor
```

Your data lives privately in **your own** Supabase project.
