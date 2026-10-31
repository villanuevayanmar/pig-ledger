'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import SummaryCards from '@/components/SummaryCards';
import SyncStatus from '@/components/SyncStatus';
import Icon from '@/components/Icon';
import { fmt, fmtKg } from '@/lib/format';
import { computeTotals } from '@/lib/totals';
import { loadLocalLedger, type LocalLedger } from '@/lib/local-store';
import { syncLedgerNow } from '@/components/ExpensesClient';

export default function HomeClient() {
  const [ledger, setLedger] = useState<LocalLedger | null>(null);

  useEffect(() => {
    syncLedgerNow().then(setLedger).catch(() => {});
  }, []);

  if (!ledger) {
    return <div className="card text-center"><p className="muted">Loading financial summary…</p></div>;
  }

  const totals = computeTotals(ledger.expenses, ledger.sales, ledger.farm.pigCount);
  const activity = [
    ...ledger.expenses.map((item) => ({ id: item.id, date: item.date, label: item.description || item.category, type: 'Expense', amount: item.lineTotal })),
    ...ledger.sales.map((item) => ({ id: item.id, date: item.date, label: item.buyer || 'Pig sale', type: 'Sale', amount: item.gross }))
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  return (
    <div className="space-y-4">
      <SyncStatus pending={ledger.pending.length} syncError={ledger.syncError} onSync={async () => setLedger(await syncLedgerNow())} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">{ledger.farm.name}</h2>
          <p className="muted">{ledger.farm.pigCount > 0 ? `${ledger.farm.pigCount} head registered` : 'Configure herd size in Settings to enable per-head profit metrics.'}</p>
        </div>
        <span className="pill">{ledger.expenses.length} expenses · {ledger.sales.length} sales · {ledger.batches.length} batches</span>
      </div>

      {totals.issueCount > 0 ? (
        <Link href="/transactions" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{totals.issueCount} expense record{totals.issueCount > 1 ? 's require' : ' requires'} review because its line total differs from quantity × unit price.</span>
        </Link>
      ) : null}

      <SummaryCards totals={totals} />

      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent activity</h3>
          <Link href="/reports" className="text-xs font-semibold text-slate-600 hover:text-slate-900">View reports</Link>
        </div>
        {activity.length ? activity.map((item) => (
          <div key={item.type + item.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{item.label}</p><p className="text-xs text-slate-500">{item.date} · {item.type}</p></div>
            <strong className={'whitespace-nowrap text-sm tabular-nums ' + (item.type === 'Expense' ? 'text-rose-700' : 'text-emerald-700')}>{item.type === 'Expense' ? '−' : '+'}{fmt(item.amount)}</strong>
          </div>
        )) : <p className="muted">Your purchases and sales will appear here after you record the first transaction.</p>}
      </section>

      <section className="card space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">At a glance</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-slate-50 px-3 py-3"><p className="text-xs text-slate-500">Weight sold</p><p className="mt-1 text-lg font-bold">{fmtKg(totals.totalWeight)}</p></div>
          <div className="rounded-lg bg-slate-50 px-3 py-3"><p className="text-xs text-slate-500">Pigs sold</p><p className="mt-1 text-lg font-bold">{totals.totalHeads}</p></div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/transactions" className="btn-primary"><Icon name="plus" className="h-4 w-4" />Record transaction</Link>
        <Link href="/batches" className="btn-blue"><Icon name="building" className="h-4 w-4" />View batches</Link>
      </div>
    </div>
  );
}
