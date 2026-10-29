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
    loadLocalLedger().then(setLedger);
    syncLedgerNow().then(setLedger).catch(() => {});
  }, []);

  if (!ledger) {
    return (
      <div className="card text-center">
        <p className="muted">Loading financial summary…</p>
      </div>
    );
  }

  const totals = computeTotals(ledger.expenses, ledger.sales, ledger.farm.pigCount);

  return (
    <div className="space-y-4">
      <SyncStatus
        pending={ledger.pending.length}
        onSync={async () => {
          setLedger(await syncLedgerNow());
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">{ledger.farm.name}</h2>
          <p className="muted">
            {ledger.farm.pigCount > 0
              ? `${ledger.farm.pigCount} head registered`
              : 'Configure herd size in Settings to enable per-head profit metrics.'}
          </p>
        </div>
        <span className="pill">
          {ledger.expenses.length} expense entries · {ledger.sales.length} sales entries
        </span>
      </div>

      {totals.issueCount > 0 ? (
        <Link
          href="/expenses"
          className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
        >
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {totals.issueCount} expense record{totals.issueCount > 1 ? 's require' : ' requires'}{' '}
            review — line total does not equal quantity × unit price. Select to resolve.
          </span>
        </Link>
      ) : null}

      <SummaryCards totals={totals} />

      <details className="card" open={ledger.expenses.length + ledger.sales.length <= 3}>
        <summary className="cursor-pointer text-sm font-semibold tracking-tight text-slate-900">
          Additional financial metrics
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {[
            { label: 'Operating Expenses', value: fmt(totals.totalExpenses), tone: 'text-rose-700' },
            { label: 'Total Revenue', value: fmt(totals.grossSales), tone: 'text-slate-900' },
            { label: 'Weight Sold', value: fmtKg(totals.totalWeight), tone: 'text-slate-900' },
            { label: 'Head Sold', value: String(totals.totalHeads), tone: 'text-slate-900' },
            {
              label: 'Net Profit',
              value: fmt(totals.netIncome),
              tone: totals.netIncome < 0 ? 'text-rose-700' : 'text-emerald-700'
            },
            {
              label: 'Net Profit / Head',
              value: totals.profitPerPig === null ? '—' : fmt(totals.profitPerPig),
              tone: 'text-slate-900'
            }
          ].map((m) => (
            <div key={m.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {m.label}
              </p>
              <p className={'mt-0.5 text-sm font-bold tabular-nums ' + m.tone}>{m.value}</p>
            </div>
          ))}
        </div>
      </details>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/expenses" className="btn-primary">
          <Icon name="plus" className="h-4 w-4" />
          Record Expense
        </Link>
        <Link href="/sales" className="btn-blue">
          <Icon name="plus" className="h-4 w-4" />
          Record Sale
        </Link>
      </div>
    </div>
  );
}
