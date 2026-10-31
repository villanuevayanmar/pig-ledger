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
import { CATEGORIES, FEED_CATEGORIES, UNITS } from '@/lib/types';
import type { Batch, Expense } from '@/lib/types';

export async function pullServerLedger() {
  const sb = createBrowserClientApp();
  const { data: authData } = await sb.auth.getUser();
  const uid = authData.user?.id;
  if (!uid) return null; // Not signed in — keep the local copy only.

  let { data: farms } = await sb
    .from('farms')
    .select('id, name, pig_count, start_date')
    .eq('user_id', uid)
    .order('created_at', { ascending: true })
    .limit(1);

  if (!farms || farms.length === 0) {
    // One-time migration: claim a legacy farm that has no owner yet.
    const { data: orphans } = await sb
      .from('farms')
      .select('id, name, pig_count, start_date')
      .is('user_id', null)
      .order('created_at', { ascending: true })
      .limit(1);
    if (orphans && orphans.length > 0) {
      const { data: claimed } = await sb
        .from('farms')
        .update({ user_id: uid })
        .eq('id', orphans[0].id)
        .select('id');
      if (claimed && claimed.length > 0) farms = [orphans[0]];
    }
  }
  if (!farms || farms.length === 0) return null;
  const f = farms[0] as { id: string; name: string; pig_count: number; start_date: string };
  const farm = {
    id: f.id,
    name: f.name || 'My Piggery',
    pigCount: Math.round(num(f.pig_count)),
    startDate: f.start_date || ''
  };
  const { data: bRows, error: batchReadError } = await sb
    .from('batches')
    .select('id, farm_id, name, start_date, target_sale_date, initial_heads, status, projection, created_at, deleted_at')
    .eq('farm_id', farm.id)
    .eq('user_id', uid)
    .is('deleted_at', null)
    .order('start_date', { ascending: false });
  if (batchReadError) throw new Error('Could not refresh batches.');
  const batches: Batch[] = ((bRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    farmId: String(r.farm_id),
    name: String(r.name ?? 'Batch'),
    startDate: String(r.start_date ?? ''),
    targetSaleDate: r.target_sale_date ? String(r.target_sale_date) : null,
    initialHeads: Math.max(0, Math.round(num(r.initial_heads))),
    status: String(r.status ?? 'active') as Batch['status'],
    projection: (r.projection && typeof r.projection === 'object' ? r.projection : {}) as Batch['projection'],
    createdAt: String(r.created_at ?? '')
  }));
  const { data: eRows, error: expenseReadError } = await sb
    .from('expenses')
    .select('id, date, category, description, qty, unit, price, kg_per_unit, line_total, batch_id, expense_type, item_name')
    .eq('farm_id', farm.id)
    .eq('user_id', uid)
    .order('date', { ascending: false });
  if (expenseReadError) throw new Error('Could not refresh expenses.');
  const { data: sRows, error: salesReadError } = await sb
    .from('sales')
    .select('id, date, buyer, heads, weight_kg, price_per_kg, gross, batch_id')
    .eq('farm_id', farm.id)
    .eq('user_id', uid)
    .order('date', { ascending: false });
  if (salesReadError) throw new Error('Could not refresh sales.');
  const expenses: Expense[] = ((eRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    date: String(r.date ?? ''),
    category: String(r.category ?? 'Other'),
    description: String(r.description ?? ''),
    qty: num(r.qty),
    unit: String(r.unit ?? 'Sack'),
    price: num(r.price),
    kgPerUnit: num(r.kg_per_unit),
    lineTotal: num(r.line_total),
    batchId: r.batch_id ? String(r.batch_id) : null,
    expenseType: String(r.expense_type ?? ''),
    itemName: String(r.item_name ?? r.description ?? '')
  }));
  const sales = ((sRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    date: String(r.date ?? ''),
    buyer: String(r.buyer ?? ''),
    heads: Math.round(num(r.heads)),
    weightKg: num(r.weight_kg),
    pricePerKg: num(r.price_per_kg),
    gross: num(r.gross),
    batchId: r.batch_id ? String(r.batch_id) : null
  }));
  return replaceLocalWithServer(farm, expenses, sales, batches);
}

/** Push queue to /api/sync, then pull the fresh server copy. */
export async function syncLedgerNow(): Promise<LocalLedger> {
  let local = await loadLocalLedger();
  if (local.pending.length > 0) {
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ops: local.pending })
      });
      const json = await res.json();
      const completed = Number.isInteger(json?.completedOps)
        ? Math.max(0, Math.min(local.pending.length, json.completedOps))
        : 0;
      if (completed > 0) {
        const completedOps = local.pending.slice(0, completed);
        const latest = await loadLocalLedger();
        const remaining = [...latest.pending];
        for (const completedOp of completedOps) {
          const index = remaining.findIndex((item) => JSON.stringify(item) === JSON.stringify(completedOp));
          if (index >= 0) remaining.splice(index, 1);
        }
        latest.pending = remaining;
        local = latest;
        await saveLocalLedger(local);
      }
      if (!res.ok || json?.ok !== true || local.pending.length > 0) {
        const latest = await loadLocalLedger();
        latest.syncError = String(json?.warning || json?.message || 'Some records could not be synchronized. They remain pending.');
        await saveLocalLedger(latest);
        return latest;
      }
      local.syncError = null;
      await saveLocalLedger(local);
    } catch {
      const latest = await loadLocalLedger();
      latest.syncError = 'Could not reach the sync service. Pending records are still saved on this device.';
      await saveLocalLedger(latest);
      return latest;
    }
  }
  try {
    const fresh = await pullServerLedger();
    if (fresh) {
      fresh.syncError = null;
      await saveLocalLedger(fresh);
      return fresh;
    }
  } catch {
    // offline — fall through
  }
  return loadLocalLedger();
}

export default function ExpensesClient() {
  const [ledger, setLedger] = useState<LocalLedger | null>(null);
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Booster');
  const [expenseType, setExpenseType] = useState('feed');

  useEffect(() => {
    syncLedgerNow().then(setLedger).catch(() => {});
  }, []);

  async function handleAdd(formData: FormData) {
    const q = num(formData.get('qty'));
    const p = num(formData.get('price'));
    const category = String(formData.get('category') || 'Booster');
    const description = String(formData.get('description') || '');
    const expenseType = String(formData.get('expenseType') || (FEED_CATEGORIES.some((item) => item === category) ? 'feed' : 'other'));
    const expense: Expense = {
      id: makeLocalId('local-exp'),
      date: String(formData.get('date') || today()),
      category,
      description,
      qty: q,
      unit: String(formData.get('unit') || 'Sack'),
      price: p,
      kgPerUnit: Math.max(0, num(formData.get('kgPerUnit'))),
      lineTotal: round2(q * p),
      batchId: String(formData.get('batchId') || '') || null,
      expenseType,
      itemName: description
    };
    const local = await loadLocalLedger();
    const op: PendingOp = { kind: 'add-expense', expense };
    local.expenses = [expense, ...local.expenses];
    local.pending = [...local.pending, op];
    await saveLocalLedger(local);
    setLedger({ ...local });
    setQty('');
    setPrice('');
    setCategory('Booster');
    setExpenseType('feed');
    syncLedgerNow().then(setLedger).catch(() => {});
  }

  async function handleEdit(formData: FormData) {
    const id = String(formData.get('id') || '');
    const local = await loadLocalLedger();
    const current = local.expenses.find((item) => item.id === id);
    if (!current) return;
    const qty = Math.max(0, num(formData.get('qty')));
    const price = Math.max(0, num(formData.get('price')));
    const description = String(formData.get('description') || '').trim();
    const updated: Expense = {
      ...current,
      date: String(formData.get('date') || current.date),
      category: String(formData.get('category') || current.category),
      description,
      itemName: description,
      qty,
      unit: String(formData.get('unit') || current.unit),
      price,
      kgPerUnit: Math.max(0, num(formData.get('kgPerUnit'))),
      lineTotal: round2(qty * price),
      batchId: String(formData.get('batchId') || '') || null,
      expenseType: String(formData.get('expenseType') || current.expenseType || 'other')
    };
    local.expenses = local.expenses.map((item) => item.id === id ? updated : item);
    const addIndex = local.pending.findIndex((op) => op.kind === 'add-expense' && op.expense.id === id);
    const updateIndex = local.pending.findIndex((op) => op.kind === 'update-expense' && op.expense.id === id);
    if (addIndex >= 0) local.pending[addIndex] = { kind: 'add-expense', expense: updated };
    else if (updateIndex >= 0) local.pending[updateIndex] = { kind: 'update-expense', expense: updated };
    else local.pending = [...local.pending, { kind: 'update-expense', expense: updated }];
    await saveLocalLedger(local);
    setLedger({ ...local });
    syncLedgerNow().then(setLedger).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this expense record? This action cannot be undone.')) return;
    const local = await loadLocalLedger();
    local.expenses = local.expenses.filter((e) => e.id !== id);
    const addIndex = local.pending.findIndex((op) => op.kind === 'add-expense' && op.expense.id === id);
    if (addIndex >= 0) {
      local.pending = local.pending.filter((op) => !((op.kind === 'add-expense' || op.kind === 'update-expense') && op.expense.id === id));
    } else {
      local.pending = [...local.pending, { kind: 'delete-expense', id }];
    }
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
            <select name="category" className="input" value={category} onChange={(event) => {
              const value = event.target.value;
              setCategory(value);
              setExpenseType(FEED_CATEGORIES.some((item) => item === value) ? 'feed' : 'other');
            }}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label><span className="label">Expense type</span><select name="expenseType" className="input" value={expenseType} onChange={(event) => setExpenseType(event.target.value)}><option value="feed">Feed</option><option value="piglets">Piglets</option><option value="medicine">Medicine</option><option value="electricity">Electricity</option><option value="labor">Labor</option><option value="utilities">Utilities</option><option value="other">Other</option></select></label>
          <label><span className="label">Assign to batch (optional)</span><select name="batchId" className="input" defaultValue=""><option value="">Farm-wide / unassigned</option>{ledger.batches.filter((batch) => batch.status !== 'archived').map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}</select></label>
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

        {expenseType === 'feed' ? <label className="block"><span className="label">Kilograms per unit (e.g. kg per sack)</span><input type="number" name="kgPerUnit" className="input" inputMode="decimal" min="0" step="any" placeholder="e.g. 50" /></label> : <input type="hidden" name="kgPerUnit" value="0" />}
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
                <details className="mt-3 border-t border-slate-100 pt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-600">Edit expense</summary>
                  <form action={handleEdit} className="mt-3 space-y-3">
                    <input type="hidden" name="id" value={e.id} />
                    <div className="grid grid-cols-2 gap-2">
                      <label><span className="label">Date</span><input className="input" type="date" name="date" defaultValue={e.date} required /></label>
                      <label><span className="label">Category</span><select className="input" name="category" defaultValue={e.category}>{CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                    </div>
                    <label className="block"><span className="label">Description</span><input className="input" name="description" defaultValue={e.description} required /></label>
                    <div className="grid grid-cols-2 gap-2">
                      <label><span className="label">Quantity</span><input className="input" type="number" min="0" step="any" name="qty" defaultValue={e.qty} required /></label>
                      <label><span className="label">Unit</span><select className="input" name="unit" defaultValue={e.unit}>{UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label><span className="label">Unit price (₱)</span><input className="input" type="number" min="0" step="0.01" name="price" defaultValue={e.price} required /></label>
                      <label><span className="label">Kg per unit</span><input className="input" type="number" min="0" step="any" name="kgPerUnit" defaultValue={e.kgPerUnit ?? 0} /></label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label><span className="label">Expense type</span><select className="input" name="expenseType" defaultValue={e.expenseType || 'other'}><option value="feed">Feed</option><option value="piglets">Piglets</option><option value="medicine">Medicine</option><option value="electricity">Electricity</option><option value="other">Other</option></select></label>
                      <label><span className="label">Batch</span><select className="input" name="batchId" defaultValue={e.batchId || ''}><option value="">Farm-wide</option>{ledger.batches.filter((batch) => batch.status !== 'archived').map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}</select></label>
                    </div>
                    <button type="submit" className="btn-primary w-full">Save changes</button>
                  </form>
                </details>
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
