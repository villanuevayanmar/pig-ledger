# Pig Farm Ledger

A phone-first piggery accounting app for tracking feed and farm expenses, pig sales, cycle profitability, and farm settings.

## Technology

- Next.js App Router
- React and TypeScript
- Tailwind CSS
- Supabase Auth and PostgreSQL
- Local-first record entry with queued synchronization
- Progressive Web App support

## Project structure

The application is in the `PigLedger/` directory. The deployment is configured to build from that directory.

## Run locally

```powershell
cd PigLedger
npm ci
npm run dev
```

Create `PigLedger/.env.local` using `PigLedger/.env.local.example` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the Supabase project. Never commit `.env.local` or any other file containing private credentials.

## Production build

```powershell
cd PigLedger
npm ci
npm run build
npm start
```

Run `supabase/schema.sql` in the intended Supabase project's SQL editor when the application schema needs to be provisioned. Review the script before applying it to an existing database.
