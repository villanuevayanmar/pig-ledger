# Pig Ledger

Mobile-first piggery accounting and farm management.

The Next.js application is in `PigLedger/`. It uses Supabase Auth and PostgreSQL, farm-scoped Row Level Security, IndexedDB offline storage, and Vercel deployment.

See [PigLedger/README.md](PigLedger/README.md) for setup, tests, database migrations, and deployment guidance.

## Quick start

```powershell
cd PigLedger
npm ci
npm run dev
```

Create `PigLedger/.env.local` from `PigLedger/.env.local.example`. Never commit environment files or server-side credentials.
