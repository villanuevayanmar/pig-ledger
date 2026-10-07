import Link from 'next/link';
import SummaryCards from '@/components/SummaryCards';
import SetupGuide from '@/components/SetupGuide';
import { loadLedger } from '@/lib/data';
import { fmt, fmtKg } from '@/lib/format';
import { createClient, supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  if (!supabaseConfigured) return <SetupGuide />;

  const sb = createClient();
  const { farm, expenses, sales, totals } = await loadLedger(sb);

  return (
    <div className="space-y-4">
      {/* Welcome */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800">{farm.name}</h2>
          <p className="muted">
            {farm.pigCount > 0 ? `${farm.pigCount} pigs` : 'Set your number of pigs in More →'}
          </p>
        </div>
        <span className="pill">
          {expenses.length} gastos · {sales.length} benta
        </span>
      </div>

      {/* Discrepancy warning — only shows when a total doesn't match */}
      {totals.issueCount > 0 ? (
        <Link
          href="/expenses"
          className="block rounded-2xl border-2 border-rose-300 bg-rose-50 px-4 py-3 text-center text-sm font-bold text-rose-700"
        >
          ⚠️ {totals.issueCount} gastos row
          {totals.issueCount > 1 ? 's have' : ' has'} a total that doesn&apos;t match
          quantity × price — tap to fix
        </Link>
      ) : null}

      <SummaryCards totals={totals} />

      {/* Profit breakdown — hidden behind a tap so the screen stays calm */}
      <details className="card" open={expenses.length + sales.length <= 3}>
        <summary className="cursor-pointer text-base font-bold text-emerald-700">
          📊 More numbers (tap to open)
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase text-slate-500">Total Gastos</p>
            <p className="mt-1 font-extrabold text-rose-600">{fmt(totals.totalExpenses)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase text-slate-500">Total Benta</p>
            <p className="mt-1 font-extrabold text-sky-600">{fmt(totals.grossSales)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase text-slate-500">Weight Sold</p>
            <p className="mt-1 font-extrabold text-slate-700">{fmtKg(totals.totalWeight)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase text-slate-500">Pigs Sold</p>
            <p className="mt-1 font-extrabold text-slate-700">{totals.totalHeads}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3">
            <p className="text-xs font-bold uppercase text-emerald-700">Net Income</p>
            <p
              className={
                'mt-1 font-extrabold ' +
                (totals.netIncome < 0 ? 'text-rose-600' : 'text-emerald-700')
              }
            >
              {fmt(totals.netIncome)}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3">
            <p className="text-xs font-bold uppercase text-emerald-700">Profit per Pig</p>
            <p
              className={
                'mt-1 font-extrabold ' +
                (totals.profitPerPig !== null && totals.profitPerPig < 0
                  ? 'text-rose-600'
                  : 'text-emerald-700')
              }
            >
              {totals.profitPerPig === null ? '—' : fmt(totals.profitPerPig)}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase text-slate-500">Cost per Pig</p>
            <p className="mt-1 font-extrabold text-slate-700">
              {totals.costPerPig === null ? '—' : fmt(totals.costPerPig)}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase text-slate-500">Cost per Kg</p>
            <p className="mt-1 font-extrabold text-slate-700">
              {totals.costPerKg === null ? '—' : fmt(totals.costPerKg)}
            </p>
          </div>
        </div>

        <h3 className="mt-5 text-sm font-bold uppercase tracking-wide text-slate-500">
          Gastos by kind
        </h3>
        {totals.categories.length === 0 ? (
          <p className="muted mt-2">No expenses yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {totals.categories.map((c) => (
              <li
                key={c.name}
                className="flex items-center justify-between rounded-lg border-l-4 border-emerald-400 bg-slate-50 px-3 py-2 text-sm"
              >
                <span>{c.name}</span>
                <span className="font-bold">{fmt(c.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </details>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/expenses" className="btn-green">
          💸 Add Gastos
        </Link>
        <Link href="/sales" className="btn-blue">
          💰 Add Benta
        </Link>
      </div>
    </div>
  );
}
