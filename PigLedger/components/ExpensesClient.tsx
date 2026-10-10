'use client';

import { useEffect, useState } from 'react';
import SyncStatus from '@/components/SyncStatus';
import Icon from '@/components/Icon';
import { createBrowserClientApp } from '@/lib/supabase/client';
import { fmt, fmtDate, num, round2, today } from '@/lib/format';
import { computeTotals } from '@/lib/totals';
import {
  loadLocalLedger,
  makeLocalId,
  replaceLocalWithServer,
  saveLocalLedger,
  type LocalLedger,
  type PendingOp
} from '@/lib/local-store';
import { CATEGORIES, UNITS } from '@/lib/types';
import type { Expense } from '@/lib/types';

export async function pullServerLedger() {
  const sb = createBrowserClientApp();
  const { data: farms } = await sb
    .from('farms')
    .select('id, name, pig_count, start_date')
    .order('created_at', { ascending: true })
    .limit(1);
  if (!farms || farms.length === 0) return null;
  const f = farms[0] as { id: string; name: string; pig_count: number; start_date: string };
  const farm = {
    id: f.id,
    name: f.name || 'My Piggery',
    pigCount: Math.round(num(f.pig_count)),
    startDate: f.start_date || ''
  };
  const { data: eRows } = await sb
    .from('expenses')
    .select('id, date, category, description, qty, unit, price, line_total')
    .eq('farm_id', farm.id)
    .order('date', { ascending: false });
  const { data: sRows } = await sb
    .from('sales')
    .select('id, date, buyer, heads, weight_kg, price_per_kg, gross')
    .eq('farm_id', farm.id)
    .order('date', { ascending: false });
  const expenses: Expense[] = ((eRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    date: String(r.date ?? ''),
    category: String(r.category ?? 'Other'),
    description: String(r.description ?? ''),
    qty: num(r.qty),
    unit: String(r.unit ?? 'Sack'),
    price: num(r.price),
    lineTotal: num(r.line_total)
  }));
  const sales = ((sRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    date: String(r.date ?? ''),
    buyer: String(r.buyer ?? ''),
    heads: Math.round(num(r.heads)),
    weightKg: num(r.weight_kg),
    pricePerKg: num(r.price_per_kg),
    gross: num(r.gross)
  }));
  return replaceLocalWithServer(farm, expenses, sales);
}

/** Push queue to /api/sync, then pull the fresh server copy. */
export async function syncLedgerNow(): Promise<LocalLedger> {
  const local = await loadLocalLedger();
  if (local.pending.length > 0) {
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ops: local.pending })
      });
      const json = await res.json();
      if (json?.ok) {
        local.pending = [];
        await saveLocalLedger(local);
      }
    } catch {
      return local; // still offline — keep queue
    }
  }
  try {
    const fresh = await pullServerLedger();
    if (fresh) return fresh;
  } catch {
    // offline — fall through
  }
  return loadLocalLedger();
}

export default function ExpensesClient() {
  const [ledger, setLedger] = useState<LocalLedger | null>(null);
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');

  useEffect(() => {
    loadLocalLedger().then(setLedger);
    syncLedgerNow().then(setLedger).catch(() => {});
  }, []);

  async function handleAdd(formData: FormData) {
    const q = num(formData.get('qty'));
    const p = num(formData.get('price'));
    const expense: Expense = {
      id: makeLocalId('local-exp'),
      date: String(formData.get('date') || today()),
      category: String(formData.get('category') || 'Booster'),
      description: String(formData.get('description') || ''),
      qty: q,
      unit: String(formData.get('unit') || 'Sack'),
      price: p,
      lineTotal: round2(q * p)
    };
    const local = await loadLocalLedger();
    const op: PendingOp = { kind: 'add-expense', expense };
    local.expenses = [expense, ...local.expenses];
    local.pending = [...local.pending, op];
    await saveLocalLedger(local);
    setLedger({ ...local });
    setQty('');
    setPrice('');
    syncLedgerNow().then(setLedger).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this expense record? This action cannot be undone.')) return;
    const local = await loadLocalLedger();
    local.expenses = local.expenses.filter((e) => e.id !== id);
    local.pending = [...local.pending, { kind: 'delete-expense', id }];
    await saveLocalLedger(local);
    setLedger({ ...local });
    syncLedgerNow().then(setLedger).catch(() => {});
  }

  if (!ledger) {
    return (
      <div className="card text-center">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const totals = computeTotals(ledger.expenses, ledger.sales, ledger.farm.pigCount);
  const lineTotal = round2(num(qty) * num(price));

  return (
    <div className="space-y-4">
      <SyncStatus pending={ledger.pending.length} onSync={async () => { setLedger(await syncLedgerNow()); }} />

      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="section-title mb-0">Operating Expenses</h2>
          <p className="section-sub">Feed, medicine, and farm operating costs</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Total Expenses
          </p>
          <p className="text-lg font-bold tabular-nums text-slate-900">{fmt(totals.totalExpenses)}</p>
        </div>
      </div>

      {totals.issueCount > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {totals.issueCount} record{totals.issueCount > 1 ? 's' : ''} require review — line total does not equal
            quantity × unit price. Select a record below to resolve.
          </span>
        </div>
      ) : null}

      <form action={handleAdd} className="card space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-1">
            <span className="label">Date</span>
            <input type="date" name="date" defaultValue={today()} className="input" required />
          </label>
          <label className="col-span-1">
            <span className="label">Feed Stage / Item Category</span>
            <select name="category" className="input" defaultValue="Booster">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="label">Description</span>
          <input type="text" name="description" className="input" placeholder="e.g. 5 sacks pre-starter feed" required />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">Quantity</span>
            <input type="number" name="qty" className="input" inputMode="decimal" min="0" step="any" placeholder="e.g. 5" value={qty} onChange={(e) => setQty(e.target.value)} required />
          </label>
          <label>
            <span className="label">Unit of Measure</span>
            <select name="unit" className="input" defaultValue="Sack">
              {UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="label">Unit Price (₱)</span>
          <input type="number" name="price" className="input" inputMode="decimal" min="0" step="0.01" placeholder="e.g. 1500" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </label>

        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <span className="text-sm font-semibold text-emerald-800">Line Total (calculated)</span>
          <span className="text-lg font-bold tabular-nums text-emerald-800">{fmt(lineTotal)}</span>
        </div>

        <p className="muted text-center">
          Offline mode — entries are stored on this device and synchronize automatically.
        </p>

        <button type="submit" className="btn-primary w-full">
          <Icon name="plus" className="h-4 w-4" />
          Record Expense
        </button>
      </form>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Expense Register ({ledger.expenses.length})
        </h3>
        {ledger.expenses.length === 0 ? (
          <div className="card text-center">
            <p className="muted">
              No expense records on file. Use the entry form above to record your first purchase.
            </p>
          </div>
        ) : (
          ledger.expenses.map((e) => {
            const expected = totals.discrepancies[e.id];
            const wrong = expected !== undefined;
            return (
              <div key={e.id} className={'card ' + (wrong ? 'border border-rose-300 bg-rose-50' : '')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{e.description || e.category}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {fmtDate(e.date)} · {e.category}
                      {e.id.startsWith('local-') ? ' · Pending sync' : ''}
                    </p>
                  </div>
                  <p className="whitespace-nowrap text-base font-bold tabular-nums text-slate-900">{fmt(e.lineTotal)}</p>
                </div>
                <p className="mt-1.5 text-xs tabular-nums text-slate-500">
                  {e.qty} {e.unit} × {fmt(e.price)} / {e.unit.toLowerCase()}
                </p>
                {wrong ? (
                  <p className="mt-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700">
                    Validation: {e.qty} × {fmt(e.price)} should equal {fmt(expected)} — recorded
                    total is {fmt(e.lineTotal)}.
                  </p>
                ) : null}
                <div className="mt-2 flex justify-end">
                  <button type="button" onClick={() => handleDelete(e.id)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-rose-600">
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
