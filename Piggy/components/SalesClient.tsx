'use client';

import { useEffect, useState } from 'react';
import SyncStatus from '@/components/SyncStatus';
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
    if (!confirm('Delete this sale?')) return;
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

      <div className="flex items-center justify-between">
        <h2 className="section-title mb-0">💰 Sales</h2>
        <div className="rounded-xl bg-sky-50 px-4 py-2 text-right">
          <p className="text-xs font-bold uppercase text-sky-500">Gross total</p>
          <p className="text-lg font-extrabold text-sky-600">{fmt(totals.grossSales)}</p>
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
            <span className="label">How many pigs?</span>
            <input type="number" name="heads" className="input" inputMode="numeric" min="0" step="1" placeholder="e.g. 12" />
          </label>
          <label>
            <span className="label">Total weight (kg)</span>
            <input type="number" name="weightKg" className="input" inputMode="decimal" min="0" step="any" placeholder="e.g. 1080" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} required />
          </label>
        </div>
        <label className="block">
          <span className="label">Price per kilo (₱)</span>
          <input type="number" name="pricePerKg" className="input" inputMode="decimal" min="0" step="0.01" placeholder="e.g. 220" value={pricePerKg} onChange={(e) => setPricePerKg(e.target.value)} required />
        </label>
        <div className="flex items-center justify-between rounded-xl bg-sky-50 px-4 py-3">
          <span className="text-sm font-bold text-sky-800">Gross (auto)</span>
          <span className="text-base font-extrabold text-sky-700">{fmt(gross)}</span>
        </div>
        <p className="muted text-center">Works offline — saves on this phone, syncs later. 📴→🟢</p>
        <button type="submit" className="btn-green w-full">＋ Add Sale</button>
      </form>
      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Saved sales ({ledger.sales.length})
        </h3>
        {ledger.sales.length === 0 ? (
          <div className="card text-center">
            <p className="text-3xl">🐖</p>
            <p className="muted mt-2">No sales yet. Record your first pig sale above.</p>
          </div>
        ) : (
          ledger.sales.map((s) => {
            const net = totals.netBySale[s.id] ?? s.gross;
            return (
              <div key={s.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-800">
                      {s.buyer || 'Buyer not set'}
                      {s.heads > 0 ? ` · ${s.heads} pig${s.heads > 1 ? 's' : ''}` : ''}
                    </p>
                    <p className="muted mt-0.5">
                      {s.date}{s.id.startsWith('local-') ? ' · ⏳ not synced' : ''}
                    </p>
                  </div>
                  <p className="whitespace-nowrap text-lg font-extrabold text-sky-600">{fmt(s.gross)}</p>
                </div>
                <p className="muted mt-1 text-sm">
                  {s.weightKg} kg × {fmt(s.pricePerKg)} · Net {fmt(net)}
                </p>
                <div className="mt-3 flex justify-end">
                  <button type="button" onClick={() => handleDelete(s.id)} className="rounded-lg px-3 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-100">
                    🗑 Delete
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
