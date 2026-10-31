'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import SyncStatus from '@/components/SyncStatus';
import { fmt, fmtDate, fmtKg, num, round2, today } from '@/lib/format';
import { loadLocalLedger, makeLocalId, saveLocalLedger, type LocalLedger } from '@/lib/local-store';
import { calculateBatchGrowthMetrics } from '@/lib/farm-operations.mjs';
import type { Expense, HealthRecord, WeightRecord } from '@/lib/types';
import { syncLedgerNow } from '@/components/ExpensesClient';

const HEALTH_TYPES: Array<{ value: HealthRecord['recordType']; label: string }> = [
  { value: 'observation', label: 'Observation' },
  { value: 'illness', label: 'Illness / symptoms' },
  { value: 'treatment', label: 'Treatment' },
  { value: 'vaccination', label: 'Vaccination' },
  { value: 'deworming', label: 'Deworming' },
  { value: 'medication', label: 'Medication' },
  { value: 'recovery', label: 'Recovery check' }
];

export default function MonitoringClient() {
  const [ledger, setLedger] = useState<LocalLedger | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    syncLedgerNow().then((value) => {
      setLedger(value);
      setSelectedBatchId(value.batches.find((batch) => batch.status === 'active')?.id ?? value.batches[0]?.id ?? '');
    }).catch((err) => setError(err instanceof Error ? err.message : 'Could not load monitoring records.'));
  }, []);

  const batches = useMemo(
    () => (ledger?.batches ?? []).filter((batch) => batch.status !== 'archived'),
    [ledger]
  );
  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId) ?? batches[0] ?? null;

  const growth = useMemo(() => {
    if (!ledger || !selectedBatch) return null;
    const weights = ledger.weightRecords
      .filter((record) => record.batchId === selectedBatch.id)
      .slice()
      .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
    if (weights.length < 2) return { weights, metrics: null, consumedFeedKg: 0, populationChanged: false };
    const previous = weights[weights.length - 2];
    const latest = weights[weights.length - 1];
    const start = new Date(previous.measuredOn + 'T00:00:00Z').getTime();
    const end = new Date(latest.measuredOn + 'T00:00:00Z').getTime();
    const days = Math.max(0, Math.round((end - start) / 86400000));
    const populationChanged =
      ledger.populationMovements.some((movement) =>
        movement.batchId === selectedBatch.id &&
        movement.movementDate > previous.measuredOn &&
        movement.movementDate <= latest.measuredOn
      ) ||
      ledger.sales.some((sale) =>
        sale.batchId === selectedBatch.id &&
        sale.date > previous.measuredOn &&
        sale.date <= latest.measuredOn
      );
    const consumedFeedKg = ledger.feedConsumption
      .filter((item) =>
        item.batchId === selectedBatch.id &&
        item.consumptionDate > previous.measuredOn &&
        item.consumptionDate <= latest.measuredOn
      )
      .reduce((sum, item) => sum + item.quantityUnits * item.kgPerUnitSnapshot, 0);
    const metrics = calculateBatchGrowthMetrics({
      startAverageWeightKg: previous.averageWeightKg,
      endAverageWeightKg: latest.averageWeightKg,
      startHeadCount: previous.headCount,
      endHeadCount: latest.headCount,
      days,
      consumedFeedKg: round2(consumedFeedKg),
      populationChanged
    });
    return { weights, metrics, consumedFeedKg, populationChanged, previous, latest, days };
  }, [ledger, selectedBatch]);

  const upcomingHealth = useMemo(() => {
    if (!ledger) return [];
    const todayValue = today();
    return ledger.healthRecords
      .filter((record) => record.nextDueDate)
      .slice()
      .sort((a, b) => String(a.nextDueDate).localeCompare(String(b.nextDueDate)))
      .map((record) => ({
        record,
        overdue: String(record.nextDueDate) < todayValue,
        dueToday: String(record.nextDueDate) === todayValue
      }));
  }, [ledger]);

  async function updateLocal(mutator: (local: LocalLedger) => void) {
    const local = await loadLocalLedger();
    mutator(local);
    await saveLocalLedger(local);
    setLedger({ ...local });
    setError('');
    setMessage('Saved on this device. Synchronizing…');
    try {
      const synced = await syncLedgerNow();
      setLedger(synced);
      if (synced.syncError) {
        setMessage('Saved locally. Sync is still pending.');
        setError(synced.syncError);
      } else {
        setMessage('Saved and synchronized.');
      }
    } catch (err) {
      setMessage('Saved locally. Sync will retry when connection returns.');
      setError(err instanceof Error ? err.message : 'Synchronization is unavailable.');
    }
  }

  async function handleWeight(formData: FormData) {
    const batchId = String(formData.get('batchId') || '');
    const batch = batches.find((item) => item.id === batchId);
    const averageWeightKg = num(formData.get('averageWeightKg'));
    const headCount = Math.floor(num(formData.get('headCount')));
    const measuredOn = String(formData.get('measuredOn') || today());
    if (!batch || averageWeightKg <= 0 || headCount <= 0) {
      setError('Choose a batch and enter a positive average weight and head count.');
      return;
    }
    const record: WeightRecord = {
      id: crypto.randomUUID(),
      farmId: batch.farmId,
      batchId,
      measuredOn,
      headCount,
      averageWeightKg,
      notes: String(formData.get('notes') || '').trim()
    };
    await updateLocal((local) => {
      local.weightRecords = [...local.weightRecords, record];
      local.pending = [...local.pending, { kind: 'add-weight-record', record }];
    });
  }

  async function handleHealth(formData: FormData) {
    const batchId = String(formData.get('batchId') || '');
    const batch = batches.find((item) => item.id === batchId);
    const title = String(formData.get('title') || '').trim();
    const cost = num(formData.get('cost'));
    const recordDate = String(formData.get('recordDate') || today());
    const nextDueDate = String(formData.get('nextDueDate') || '') || null;
    const recordType = String(formData.get('recordType') || 'observation') as HealthRecord['recordType'];
    if (!batch || !title || cost < 0 || !HEALTH_TYPES.some((item) => item.value === recordType)) {
      setError('Choose a batch and record type, enter a title, and use a valid cost.');
      return;
    }
    const expenseId = cost > 0 ? makeLocalId('local-exp') : null;
    const expense: Expense | null = cost > 0 ? {
      id: expenseId!,
      date: recordDate,
      category: 'Vitamins / Medicine',
      description: title,
      qty: 1,
      unit: 'Piece',
      price: cost,
      lineTotal: round2(cost),
      batchId,
      expenseType: 'medicine',
      itemName: title,
      kgPerUnit: 0
    } : null;
    const record: HealthRecord = {
      id: crypto.randomUUID(),
      farmId: batch.farmId,
      batchId,
      recordDate,
      recordType,
      title,
      symptoms: String(formData.get('symptoms') || '').trim(),
      medicine: String(formData.get('medicine') || '').trim(),
      dosage: String(formData.get('dosage') || '').trim(),
      treatedHeads: Math.max(0, Math.floor(num(formData.get('treatedHeads')))),
      cost: round2(cost),
      expenseId,
      nextDueDate,
      notes: String(formData.get('notes') || '').trim()
    };
    await updateLocal((local) => {
      if (expense) {
        local.expenses = [expense, ...local.expenses];
        local.pending = [...local.pending, { kind: 'add-expense', expense }];
      }
      local.healthRecords = [...local.healthRecords, record];
      local.pending = [...local.pending, { kind: 'add-health-record', record }];
    });
  }

  if (!ledger) return <div className="card text-center"><p className="muted">Loading animal monitoring…</p></div>;

  return (
    <div className="space-y-4">
      <SyncStatus pending={ledger.pending.length} syncError={ledger.syncError} onSync={async () => setLedger(await syncLedgerNow())} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="section-title">Animal Monitoring</h2>
          <p className="section-sub">Track batch weights, growth, treatments and follow-up dates.</p>
        </div>
        <Link className="btn-secondary shrink-0" href="/operations">Farm operations</Link>
      </div>
      {!ledger.monitoringSchemaReady ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Database setup required.</strong> Records can be saved on this device, but online synchronization needs the Phase 3 animal-monitoring migration applied to Supabase.
        </div>
      ) : null}
      {message ? <p role="status" className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}

      {batches.length > 0 ? (
        <>
          <label className="block"><span className="label">Selected batch</span>
            <select className="input" value={selectedBatch?.id ?? ''} onChange={(event) => setSelectedBatchId(event.target.value)}>
              {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
            </select>
          </label>

          <section className="card space-y-3">
            <div>
              <h3 className="font-semibold">Growth overview</h3>
              <p className="text-xs text-slate-500">Metrics use the two latest weight records for the selected batch.</p>
            </div>
            {growth?.metrics && growth.previous && growth.latest ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Latest average weight" value={fmtKg(growth.latest.averageWeightKg)} />
                  <Metric label="Gain per pig" value={fmtKg(growth.metrics.gainPerHeadKg)} />
                  <Metric label="Average daily gain" value={growth.metrics.averageDailyGainKg === null ? 'Not available' : fmtKg(growth.metrics.averageDailyGainKg) + ' / day'} />
                  <Metric label="Feed consumed in period" value={fmtKg(growth.consumedFeedKg)} />
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">Feed conversion ratio (FCR)</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{growth.metrics.fcr === null ? 'Not available' : growth.metrics.fcr.toFixed(2)}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {growth.metrics.fcrEligible
                      ? 'Estimated from actual feed consumption and calculated total liveweight gain.'
                      : 'FCR is withheld because the head count changed, the population had movements or sales, or there is insufficient feed/weight gain data.'}
                  </p>
                </div>
                <p className="text-xs text-slate-500">Measurement interval: {fmtDate(growth.previous.measuredOn)} to {fmtDate(growth.latest.measuredOn)} ({growth.days} day(s)). Population at measurements: {growth.previous.headCount} to {growth.latest.headCount} head(s).</p>
                {growth.populationChanged ? <p className="text-xs font-semibold text-amber-700">Population movements or sales occurred in this interval; FCR is not reported.</p> : null}
              </>
            ) : (
              <p className="muted">Add at least two weight records for this batch before growth and FCR can be calculated.</p>
            )}
          </section>

          <section className="card space-y-3">
            <div>
              <h3 className="font-semibold">Record a weight measurement</h3>
              <p className="text-xs text-slate-500">Enter the batch's head count and average liveweight at the time of weighing.</p>
            </div>
            <form action={handleWeight} className="space-y-3">
              <input type="hidden" name="batchId" value={selectedBatch?.id ?? ''} />
              <div className="grid grid-cols-2 gap-3">
                <label><span className="label">Measurement date</span><input className="input" type="date" name="measuredOn" defaultValue={today()} required /></label>
                <label><span className="label">Head count</span><input className="input" type="number" name="headCount" min="1" step="1" required /></label>
              </div>
              <label className="block"><span className="label">Average liveweight (kg)</span><input className="input" type="number" name="averageWeightKg" min="0.01" step="any" required /></label>
              <label className="block"><span className="label">Notes (optional)</span><input className="input" name="notes" placeholder="Scale, sample, or observation notes" /></label>
              <button className="btn-primary w-full" type="submit">Save weight record</button>
            </form>
          </section>

          <section className="card space-y-3">
            <h3 className="font-semibold">Weight history</h3>
            {growth?.weights.length ? (
              <div className="space-y-2">
                {growth.weights.slice().reverse().map((record) => (
                  <div key={record.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                    <div><p className="text-sm font-semibold">{fmtDate(record.measuredOn)}</p><p className="text-xs text-slate-500">{record.headCount} head(s) · {record.notes || 'No notes'}</p></div>
                    <strong className="tabular-nums">{fmtKg(record.averageWeightKg)} avg.</strong>
                  </div>
                ))}
              </div>
            ) : <p className="muted">No weight records for this batch yet.</p>}
          </section>

          <section className="card space-y-3">
            <div>
              <h3 className="font-semibold">Health and treatment records</h3>
              <p className="text-xs text-slate-500">Costs are also added to Expenses and linked to this health record.</p>
            </div>
            <form action={handleHealth} className="space-y-3">
              <input type="hidden" name="batchId" value={selectedBatch?.id ?? ''} />
              <div className="grid grid-cols-2 gap-3">
                <label><span className="label">Date</span><input className="input" type="date" name="recordDate" defaultValue={today()} required /></label>
                <label><span className="label">Record type</span><select className="input" name="recordType">{HEALTH_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              </div>
              <label className="block"><span className="label">Title / condition</span><input className="input" name="title" placeholder="e.g. Deworming or cough observation" required /></label>
              <label className="block"><span className="label">Symptoms / observation</span><input className="input" name="symptoms" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label><span className="label">Medicine / vaccine</span><input className="input" name="medicine" /></label>
                <label><span className="label">Dosage / instructions</span><input className="input" name="dosage" /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label><span className="label">Pigs treated</span><input className="input" type="number" min="0" step="1" name="treatedHeads" defaultValue="0" /></label>
                <label><span className="label">Cost (₱)</span><input className="input" type="number" min="0" step="0.01" name="cost" defaultValue="0" /></label>
              </div>
              <label className="block"><span className="label">Next due date (optional)</span><input className="input" type="date" name="nextDueDate" /></label>
              <label className="block"><span className="label">Notes (optional)</span><input className="input" name="notes" /></label>
              <button className="btn-primary w-full" type="submit">Save health record</button>
            </form>
            {ledger.healthRecords.filter((record) => record.batchId === selectedBatch?.id).length > 0 ? (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <h4 className="text-sm font-semibold">Recent batch health history</h4>
                {ledger.healthRecords.filter((record) => record.batchId === selectedBatch?.id).slice().sort((a, b) => b.recordDate.localeCompare(a.recordDate)).slice(0, 8).map((record) => (
                  <div key={record.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2"><strong className="text-sm">{record.title}</strong><span className="text-xs text-slate-500">{fmtDate(record.recordDate)}</span></div>
                    <p className="mt-1 text-xs text-slate-600">{record.recordType} · {record.treatedHeads} treated · {fmt(record.cost)}</p>
                    {record.medicine ? <p className="mt-1 text-xs text-slate-500">{record.medicine}{record.dosage ? ' · ' + record.dosage : ''}</p> : null}
                    {record.nextDueDate ? <p className="mt-1 text-xs font-medium text-amber-700">Next due: {fmtDate(record.nextDueDate)}</p> : null}
                  </div>
                ))}
              </div>
            ) : <p className="muted">No health records for this batch yet.</p>}
          </section>
        </>
      ) : (
        <div className="card space-y-2 text-center">
          <h3 className="font-semibold">No batches available</h3>
          <p className="muted">Create a batch before recording weights or health events.</p>
          <Link className="btn-primary inline-flex" href="/batches">Open Batches</Link>
        </div>
      )}

      <section className="card space-y-3">
        <h3 className="font-semibold">Due health follow-ups</h3>
        {upcomingHealth.length > 0 ? upcomingHealth.map(({ record, overdue, dueToday }) => (
          <div key={record.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0">
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{record.title}</p><p className="text-xs text-slate-500">{ledger.batches.find((batch) => batch.id === record.batchId)?.name ?? 'Batch'} · {fmtDate(record.nextDueDate!)}</p></div>
            <span className={'shrink-0 text-xs font-semibold ' + (overdue ? 'text-rose-700' : dueToday ? 'text-amber-700' : 'text-slate-500')}>{overdue ? 'Overdue' : dueToday ? 'Due today' : 'Upcoming'}</span>
          </div>
        )) : <p className="muted">No follow-up dates recorded yet.</p>}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-lg font-bold tabular-nums">{value}</p></div>;
}
