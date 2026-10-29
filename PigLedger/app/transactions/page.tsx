'use client';

import { useState } from 'react';
import ExpensesClient from '@/components/ExpensesClient';
import SalesClient from '@/components/SalesClient';

type View = 'expenses' | 'sales';

export default function TransactionsPage() {
  const [view, setView] = useState<View>('expenses');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="section-title">Transactions</h2>
        <p className="section-sub">Record actual purchases and sales once. Linked batches use these records automatically.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Transaction type">
        <button type="button" role="tab" aria-selected={view === 'expenses'} onClick={() => setView('expenses')} className={'rounded-lg px-3 py-2.5 text-sm font-semibold transition ' + (view === 'expenses' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>Expenses</button>
        <button type="button" role="tab" aria-selected={view === 'sales'} onClick={() => setView('sales')} className={'rounded-lg px-3 py-2.5 text-sm font-semibold transition ' + (view === 'sales' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>Sales</button>
      </div>
      {view === 'expenses' ? <ExpensesClient /> : <SalesClient />}
    </div>
  );
}
