'use client';

import { useEffect, useState } from 'react';
import SyncStatus from '@/components/SyncStatus';
import { fmt, fmtKg } from '@/lib/format';
import { computeTotals } from '@/lib/totals';
import { loadLocalLedger, type LocalLedger } from '@/lib/local-store';
import { syncLedgerNow } from '@/components/ExpensesClient';

export default function ReportsPage() {
  const [ledger, setLedger] = useState<LocalLedger | null>(null);

  useEffect(() => {
    loadLocalLedger().then(setLedger);
    syncLedgerNow().then(setLedger).catch(() => {});
  }, []);

  if (!ledger) return <div className="card text-center"><p className="muted">Loading reports…</p></div>;

  const totals = computeTotals(ledger.expenses, ledger.sales, ledger.farm.pigCount);
  const recentExpenses = [...ledger.expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const recentSales = [...ledger.sales].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  return (
    <div className="space-y-4">
      <SyncStatus pending={ledger.pending.length} onSync={async () => setLedger(await syncLedgerNow())} />
      <div><h2 className="section-title">Reports</h2><p className="section-sub">Review recent transactions and financial breakdowns.</p></div>
      <section className="card space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Operating summary</h3>
        <div className="flex items-center justify-between gap-3"><span className="text-sm text-slate-600">Expenses</span><strong className="tabular-nums">{fmt(totals.totalExpenses)}</strong></div>
        <div className="flex items-center justify-between gap-3"><span className="text-sm text-slate-600">Sales revenue</span><strong className="tabular-nums">{fmt(totals.grossSales)}</strong></div>
        <div className="flex items-center justify-between gap-3"><span className="text-sm text-slate-600">Net result</span><strong className={'tabular-nums ' + (totals.netIncome < 0 ? 'text-rose-700' : 'text-emerald-700')}>{fmt(totals.netIncome)}</strong></div>
        <div className="flex items-center justify-between gap-3"><span className="text-sm text-slate-600">Weight sold</span><strong className="tabular-nums">{fmtKg(totals.totalWeight)}</strong></div>
        <div className="flex items-center justify-between gap-3"><span className="text-sm text-slate-600">Pigs sold</span><strong className="tabular-nums">{totals.totalHeads}</strong></div>
      </section>
      <section className="card space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Expenses by category</h3>
        {totals.categories.length ? totals.categories.map((item) => (
          <div key={item.name} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm"><span>{item.name}</span><strong className="tabular-nums">{fmt(item.total)}</strong></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-800" style={{ width: `${totals.totalExpenses > 0 ? Math.min(100, (item.total / totals.totalExpenses) * 100) : 0}%` }} /></div>
          </div>
        )) : <p className="muted">No expense records yet.</p>}
      </section>
      <section className="card space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent expenses</h3>
        {recentExpenses.length ? recentExpenses.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
            <div className="min-w-0"><p className="truncate text-sm font-medium">{item.description || item.category}</p><p className="text-xs text-slate-500">{item.date} · {item.category}</p></div><strong className="whitespace-nowrap text-sm tabular-nums">{fmt(item.lineTotal)}</strong>
          </div>
        )) : <p className="muted">No expense records yet.</p>}
      </section>
      <section className="card space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent sales</h3>
        {recentSales.length ? recentSales.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
            <div className="min-w-0"><p className="truncate text-sm font-medium">{item.buyer || 'Buyer not specified'}</p><p className="text-xs text-slate-500">{item.date} · {fmtKg(item.weightKg)}</p></div><strong className="whitespace-nowrap text-sm tabular-nums">{fmt(item.gross)}</strong>
          </div>
        )) : <p className="muted">No sale records yet.</p>}
      </section>
    </div>
  );
}
