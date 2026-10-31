'use client';

import { useEffect, useMemo, useState } from 'react';
import SyncStatus from '@/components/SyncStatus';
import Icon from '@/components/Icon';
import { fmt, fmtKg, num, today } from '@/lib/format';
import { loadLocalLedger, saveLocalLedger, type LocalLedger } from '@/lib/local-store';
import { FEED_CATEGORIES, type Batch, type BatchProjection } from '@/lib/types';
import { syncLedgerNow } from '@/components/ExpensesClient';

const EMPTY_PROJECTION: BatchProjection = {
  plannedHeads: 0,
  expectedAvgSaleWeightKg: 0,
  expectedPricePerKg: 0,
  pigletPricePerHead: 0,
  projectedFeedCost: 0,
  projectedOtherCosts: 0
};

function isFeedExpense(expense: LocalLedger['expenses'][number]) {
  return expense.expenseType === 'feed' || FEED_CATEGORIES.includes(expense.category as typeof FEED_CATEGORIES[number]);
}

export default function BatchClient() {
  const [ledger, setLedger] = useState<LocalLedger | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const [showProjection, setShowProjection] = useState(false);
  const [savingProjection, setSavingProjection] = useState(false);
  const [projectionError, setProjectionError] = useState('');

  useEffect(() => {
        syncLedgerNow().then((value) => {
      setLedger(value);
      setSelectedId((current) => current || value.batches[0]?.id || '');
    }).catch(() => {});
  }, []);

  const selectedBatch = ledger?.batches.find((batch) => batch.id === selectedId) ?? null;
  const actuals = useMemo(() => {
    if (!ledger || !selectedBatch) return null;
    const expenses = ledger.expenses.filter((item) => item.batchId === selectedBatch.id);
    const sales = ledger.sales.filter((item) => item.batchId === selectedBatch.id);
    const feedPurchases = expenses.filter(isFeedExpense).reduce((sum, item) => sum + item.lineTotal, 0);
    const otherExpenses = expenses.filter((item) => !isFeedExpense(item)).reduce((sum, item) => sum + item.lineTotal, 0);
    const revenue = sales.reduce((sum, item) => sum + item.gross, 0);
    const weight = sales.reduce((sum, item) => sum + item.weightKg, 0);
    return { expenses, sales, feedPurchases, otherExpenses, revenue, weight, net: revenue - feedPurchases - otherExpenses };
  }, [ledger, selectedBatch]);

  async function handleCreate(formData: FormData) {
    const local = await loadLocalLedger();
    const name = String(formData.get('name') || '').trim();
    if (!name) return;
    const batch: Batch = {
      id: crypto.randomUUID(),
      farmId: local.farm.id,
      name,
      startDate: String(formData.get('startDate') || today()),
      targetSaleDate: String(formData.get('targetSaleDate') || '') || null,
      initialHeads: Math.max(0, Math.floor(num(formData.get('initialHeads')))),
      status: 'active',
      projection: { ...EMPTY_PROJECTION },
      createdAt: new Date().toISOString()
    };
    local.batches = [batch, ...local.batches];
    local.pending = [...local.pending, { kind: 'add-batch', batch }];
    await saveLocalLedger(local);
    setLedger({ ...local });
    setSelectedId(batch.id);
    setCreating(false);
    syncLedgerNow().then(setLedger).catch(() => {});
  }

  async function handleSaveProjection(formData: FormData) {
    if (!selectedBatch) return;
    setSavingProjection(true);
    setProjectionError('');
    try {
      const projection: BatchProjection = {
        plannedHeads: Math.max(0, Math.floor(num(formData.get('plannedHeads')))),
        expectedAvgSaleWeightKg: Math.max(0, num(formData.get('expectedAvgSaleWeightKg'))),
        expectedPricePerKg: Math.max(0, num(formData.get('expectedPricePerKg'))),
        pigletPricePerHead: Math.max(0, num(formData.get('pigletPricePerHead'))),
        projectedFeedCost: Math.max(0, num(formData.get('projectedFeedCost'))),
        projectedOtherCosts: Math.max(0, num(formData.get('projectedOtherCosts')))
      };
      const local = await loadLocalLedger();
      const updated = { ...selectedBatch, projection };
      local.batches = local.batches.map((batch) => batch.id === updated.id ? updated : batch);
      local.pending = [...local.pending, { kind: 'update-batch', batch: updated }];
      await saveLocalLedger(local);
      setLedger({ ...local });
      const synced = await syncLedgerNow();
      setLedger(synced);
      setShowProjection(false);
    } catch (error) {
      setProjectionError(error instanceof Error ? error.message : 'Could not save the projection.');
    } finally {
      setSavingProjection(false);
    }
  }

  async function handleStatus(status: Batch['status']) {
    if (!selectedBatch) return;
    const local = await loadLocalLedger();
    const updated = { ...selectedBatch, status };
    local.batches = local.batches.map((batch) => batch.id === updated.id ? updated : batch);
    local.pending = [...local.pending, { kind: 'update-batch', batch: updated }];
    await saveLocalLedger(local);
    setLedger({ ...local });
    syncLedgerNow().then(setLedger).catch(() => {});
  }

  if (!ledger) return <div className="card text-center"><p className="muted">Loading batches…</p></div>;

  const projection = selectedBatch?.projection ?? EMPTY_PROJECTION;
  const projectedRevenue = projection.plannedHeads * projection.expectedAvgSaleWeightKg * projection.expectedPricePerKg;
  const projectedCosts = projection.plannedHeads * projection.pigletPricePerHead + projection.projectedFeedCost + projection.projectedOtherCosts;
  const projectedProfit = projectedRevenue - projectedCosts;

  return (
    <div className="space-y-4">
      <SyncStatus pending={ledger.pending.length} syncError={ledger.syncError} onSync={async () => setLedger(await syncLedgerNow())} />
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="section-title mb-1">Batches</h2><p className="section-sub">Actual results come from linked transactions. Projections stay separate from the ledger.</p></div>
        <button type="button" onClick={() => setCreating((value) => !value)} className="btn-primary shrink-0"><Icon name="plus" className="h-4 w-4" /> New batch</button>
      </div>

      {creating ? (
        <form action={handleCreate} className="card space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Create batch</h3>
          <label className="block"><span className="label">Batch name</span><input name="name" className="input" placeholder="e.g. Batch October 2026" required /></label>
          <div className="grid grid-cols-2 gap-3">
            <label><span className="label">Start date</span><input type="date" name="startDate" defaultValue={today()} className="input" required /></label>
            <label><span className="label">Initial head count</span><input type="number" name="initialHeads" min="0" step="1" inputMode="numeric" className="input" placeholder="Enter count" /></label>
          </div>
          <label className="block"><span className="label">Target sale date (optional)</span><input type="date" name="targetSaleDate" className="input" /></label>
          <div className="grid grid-cols-2 gap-2"><button className="btn-primary" type="submit">Create batch</button><button className="btn-secondary" type="button" onClick={() => setCreating(false)}>Cancel</button></div>
        </form>
      ) : null}

      {ledger.batches.length === 0 ? (
        <div className="card space-y-2 text-center">
          <Icon name="building" className="mx-auto h-8 w-8 text-slate-400" />
          <h3 className="font-semibold">No batches yet</h3>
          <p className="muted">Create a batch, then assign feed purchases and sales to it from Transactions. Batch actuals will update automatically.</p>
          <button type="button" onClick={() => setCreating(true)} className="btn-primary mx-auto">Create your first batch</button>
        </div>
      ) : (
        <>
          <label className="block"><span className="label">Selected batch</span>
            <select className="input" value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setShowProjection(false); }}>
              {ledger.batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name} · {batch.status}</option>)}
            </select>
          </label>

          {selectedBatch && actuals ? (
            <>
              <section className="card space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div><h3 className="text-lg font-bold">{selectedBatch.name}</h3><p className="text-xs text-slate-500">Started {selectedBatch.startDate} · {selectedBatch.initialHeads} initial head(s)</p></div>
                  <select aria-label="Batch status" className="input max-w-36 text-xs" value={selectedBatch.status} onChange={(event) => handleStatus(event.target.value as Batch['status'])}>
                    <option value="active">Active</option><option value="completed">Completed</option><option value="archived">Archived</option>
                  </select>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Actual performance</p>
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Feed purchases" value={fmt(actuals.feedPurchases)} />
                  <Metric label="Other expenses" value={fmt(actuals.otherExpenses)} />
                  <Metric label="Sales revenue" value={fmt(actuals.revenue)} />
                  <Metric label="Net result" value={fmt(actuals.net)} tone={actuals.net < 0 ? 'text-rose-700' : 'text-emerald-700'} />
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm"><span className="text-slate-500">Actual sales weight</span><strong>{fmtKg(actuals.weight)}</strong></div>
                <div className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-500">Linked records</span><strong>{actuals.expenses.length} expense(s) · {actuals.sales.length} sale(s)</strong></div>
                <p className="text-xs text-slate-500">Only transactions assigned to this batch are included. Feed purchases are counted when bought, not when consumed.</p>
              </section>

              <section className="card space-y-3">
                <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Projection</h3><p className="text-xs text-slate-500">Estimates only; these figures do not affect actual reports.</p></div><button type="button" className="btn-secondary" onClick={() => setShowProjection((value) => !value)}>{showProjection ? 'Close' : 'Edit estimates'}</button></div>
                <div className="grid grid-cols-2 gap-3"><Metric label="Projected revenue" value={fmt(projectedRevenue)} /><Metric label="Projected costs" value={fmt(projectedCosts)} /><Metric label="Projected profit" value={fmt(projectedProfit)} tone={projectedProfit < 0 ? 'text-rose-700' : 'text-emerald-700'} /><Metric label="Expected weight" value={fmtKg(projection.plannedHeads * projection.expectedAvgSaleWeightKg)} /></div>
                {showProjection ? (
                  <form key={selectedBatch.id} action={handleSaveProjection} className="space-y-3 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-500">Enter expected values. Nothing is saved as an actual expense or sale.</p>
                    <div className="grid grid-cols-2 gap-3">
                      <label><span className="label">Planned head count</span><input name="plannedHeads" type="number" min="0" step="1" className="input" defaultValue={projection.plannedHeads || ''} placeholder="e.g. 12" /></label>
                      <label><span className="label">Expected kg per pig</span><input name="expectedAvgSaleWeightKg" type="number" min="0" step="any" className="input" defaultValue={projection.expectedAvgSaleWeightKg || ''} placeholder="Enter estimate" /></label>
                      <label><span className="label">Expected price per kg (₱)</span><input name="expectedPricePerKg" type="number" min="0" step="0.01" className="input" defaultValue={projection.expectedPricePerKg || ''} placeholder="Enter estimate" /></label>
                      <label><span className="label">Piglet cost per head (₱)</span><input name="pigletPricePerHead" type="number" min="0" step="0.01" className="input" defaultValue={projection.pigletPricePerHead || ''} placeholder="Enter estimate" /></label>
                      <label><span className="label">Projected feed cost (₱)</span><input name="projectedFeedCost" type="number" min="0" step="0.01" className="input" defaultValue={projection.projectedFeedCost || ''} placeholder="Enter estimate" /></label>
                      <label><span className="label">Other projected costs (₱)</span><input name="projectedOtherCosts" type="number" min="0" step="0.01" className="input" defaultValue={projection.projectedOtherCosts || ''} placeholder="Enter estimate" /></label>
                    </div>
                    {projectionError ? <p className="text-sm text-rose-700">{projectionError}</p> : null}
                    <button type="submit" className="btn-primary w-full" disabled={savingProjection}>{savingProjection ? 'Saving…' : 'Save projection'}</button>
                  </form>
                ) : null}
              </section>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function Metric({ label, value, tone = 'text-slate-900' }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"><p className="text-xs font-medium text-slate-500">{label}</p><p className={'mt-1 text-lg font-bold tabular-nums ' + tone}>{value}</p></div>;
}
