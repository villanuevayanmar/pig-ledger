'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import SummaryCards from '@/components/SummaryCards';
import SyncStatus from '@/components/SyncStatus';
import { fmt, fmtKg } from '@/lib/format';
import { computeTotals } from '@/lib/totals';
import { loadLocalLedger, type LocalLedger } from '@/lib/local-store';
import { syncLedgerNow } from '@/components/ExpensesClient';

export default function HomeClient() {
  const [ledger, setLedger] = useState<LocalLedger | null>(null);

  useEffect(() => {
    loadLocalLedger().then(setLedger);
    syncLedgerNow().then(setLedger).catch(() => {});
  }, []);

  if (!ledger) {
    return (
      <div className="card text-center">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const totals = computeTotals(ledger.expenses, ledger.sales, ledger.farm.pigCount);

  return (
    <div className="space-y-4">
      <SyncStatus pending={ledger.pending.length} onSync={async () => { setLedger(await syncLedgerNow()); }} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800">{ledger.farm.name}</h2>
          <p className="muted">
            {ledger.farm.pigCount > 0 ? `${ledger.farm.pigCount} pigs` : 'Set your number of pigs in Settings →'}
          </p>
        </div>
        <span className="pill">
          {ledger.expenses.length} expenses · {ledger.sales.length} sales
        </span>
      </div>

      {totals.issueCount > 0 ? (
        <Link href="/expenses" className="block rounded-2xl border-2 border-rose-300 bg-rose-50 px-4 py-3 text-center text-sm font-bold text-rose-700">
          ⚠️ {totals.issueCount} expense row{totals.issueCount > 1 ? 's have' : ' has'} a total that doesn&apos;t match
          quantity × price — tap to fix
        </Link>
      ) : null}

      <SummaryCards totals={totals} />

      <details className="card" open={ledger.expenses.length + ledger.sales.length <= 3}>
        <summary className="cursor-pointer text-base font-bold text-emerald-700">
          📊 More numbers (tap to open)
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase text-slate-500">Total Expenses</p>
            <p className="mt-1 font-extrabold text-rose-600">{fmt(totals.totalExpenses)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase text-slate-500">Total Sales</p>
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
            <p className={'mt-1 font-extrabold ' + (totals.netIncome < 0 ? 'text-rose-600' : 'text-emerald-700')}>
              {fmt(totals.netIncome)}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3">
            <p className="text-xs font-bold uppercase text-emerald-700">Profit per Pig</p>
            <p className="mt-1 font-extrabold text-emerald-700">
              {totals.profitPerPig === null ? '—' : fmt(totals.profitPerPig)}
            </p>
          </div>
        </div>
      </details>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/expenses" className="btn-green">💸 Add Expense</Link>
        <Link href="/sales" className="btn-blue">💰 Add Sale</Link>
      </div>
    </div>
  );
}
