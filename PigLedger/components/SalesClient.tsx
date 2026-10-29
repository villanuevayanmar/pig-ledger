'use client';

import { useEffect, useState } from 'react';
import SyncStatus from '@/components/SyncStatus';
import Icon from '@/components/Icon';
import { fmt, num, round2, today } from '@/lib/format';
import { computeTotals } from '@/lib/totals';
import {
  loadLocalLedger,
  makeLocalId,
  saveLocalLedger,
  type LocalLedger,
  type PendingOp
} from '@/lib/local-store';
import { syncLedgerNow } from '@/components/ExpensesClient';
import type { Sale } from '@/lib/types';

export default function SalesClient() {
  const [ledger, setLedger] = useState<LocalLedger | null>(null);
  const [weightKg, setWeightKg] = useState('');
  const [pricePerKg, setPricePerKg] = useState('');

  useEffect(() => {
    loadLocalLedger().then(setLedger);
    syncLedgerNow().then(setLedger).catch(() => {});
  }, []);

  async function handleAdd(formData: FormData) {
    const w = num(formData.get('weightKg'));
    const p = num(formData.get('pricePerKg'));
    const sale: Sale = {
      id: makeLocalId('local-sale'),
      date: String(formData.get('date') || today()),
      buyer: String(formData.get('buyer') || ''),
      heads: Math.round(num(formData.get('heads'))),
      weightKg: w,
      pricePerKg: p,
      gross: round2(w * p)
    };
    const local = await loadLocalLedger();
    const op: PendingOp = { kind: 'add-sale', sale };
    local.sales = [sale, ...local.sales];
    local.pending = [...local.pending, op];
    await saveLocalLedger(local);
    setLedger({ ...local });
    setWeightKg('');
    setPricePerKg('');
    syncLedgerNow().then(setLedger).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this sale record? This action cannot be undone.')) return;
    const local = await loadLocalLedger();
    local.sales = local.sales.filter((s) => s.id !== id);
    local.pending = [...local.pending, { kind: 'delete-sale', id }];
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
  const gross = round2(num(weightKg) * num(pricePerKg));

  return (
    <div className="space-y-4">
      <SyncStatus pending={ledger.pending.length} onSync={async () => { setLedger(await syncLedgerNow()); }} />

      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="section-title mb-0">Sales Revenue</h2>
          <p className="section-sub">Recorded pig sales and realized revenue</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Total Revenue
          </p>
          <p className="text-lg font-bold tabular-nums text-slate-900">{fmt(totals.grossSales)}</p>
        </div>
      </div>

      <form action={handleAdd} className="card space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">Date</span>
            <input type="date" name="date" defaultValue={today()} className="input" required />
          </label>
          <label>
            <span className="label">Buyer</span>
            <input type="text" name="buyer" className="input" placeholder="e.g. Mang Roger" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">Number of Heads</span>
            <input type="number" name="heads" className="input" inputMode="numeric" min="0" step="1" placeholder="e.g. 12" />
          </label>
          <label>
            <span className="label">Total Weight (kg)</span>
            <input type="number" name="weightKg" className="input" inputMode="decimal" min="0" step="any" placeholder="e.g. 1080" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} required />
          </label>
        </div>
        <label className="block">
          <span className="label">Price per Kilogram (₱)</span>
          <input type="number" name="pricePerKg" className="input" inputMode="decimal" min="0" step="0.01" placeholder="e.g. 220" value={pricePerKg} onChange={(e) => setPricePerKg(e.target.value)} required />
        </label>
        <div className="flex items-center justify-between rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
          <span className="text-sm font-semibold text-sky-800">Gross Revenue (calculated)</span>
          <span className="text-base font-bold tabular-nums text-sky-800">{fmt(gross)}</span>
        </div>
        <p className="muted text-center">
          Offline mode — entries are stored on this device and synchronize automatically.
        </p>
        <button type="submit" className="btn-primary w-full">
          <Icon name="plus" className="h-4 w-4" />
          Record Sale
        </button>
      </form>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Sales Register ({ledger.sales.length})
        </h3>
        {ledger.sales.length === 0 ? (
          <div className="card text-center">
            <p className="muted">
              No sales records on file. Use the entry form above to record your first sale.
            </p>
          </div>
        ) : (
          ledger.sales.map((s) => {
            const net = totals.netBySale[s.id] ?? s.gross;
            return (
              <div key={s.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {s.buyer || 'Buyer not specified'}
                      {s.heads > 0 ? ` · ${s.heads} head${s.heads > 1 ? 's' : ''}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {s.date}{s.id.startsWith('local-') ? ' · Pending sync' : ''}
                    </p>
                  </div>
                  <p className="whitespace-nowrap text-base font-bold tabular-nums text-slate-900">{fmt(s.gross)}</p>
                </div>
                <p className="mt-1.5 text-xs tabular-nums text-slate-500">
                  {s.weightKg} kg × {fmt(s.pricePerKg)} · Net proceeds {fmt(net)}
                </p>
                <div className="mt-2 flex justify-end">
                  <button type="button" onClick={() => handleDelete(s.id)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-rose-600">
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
