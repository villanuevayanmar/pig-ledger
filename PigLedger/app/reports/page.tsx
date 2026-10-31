'use client';

import { useEffect, useMemo, useState } from 'react';
import SyncStatus from '@/components/SyncStatus';
import { fmt, fmtKg, num, round2 } from '@/lib/format';
import { FEED_CATEGORIES } from '@/lib/types';
import { loadLocalLedger, type LocalLedger } from '@/lib/local-store';
import { syncLedgerNow } from '@/components/ExpensesClient';

type ReportExpense = LocalLedger['expenses'][number];

function isFeed(item: ReportExpense) {
  return item.expenseType === 'feed' || FEED_CATEGORIES.includes(item.category as typeof FEED_CATEGORIES[number]);
}

function isType(item: ReportExpense, type: string) {
  return (item.expenseType || '').toLowerCase() === type;
}

function isElectricity(item: ReportExpense) {
  return isType(item, 'electricity') || isType(item, 'utilities') && /electric/i.test(item.description);
}

export default function ReportsPage() {
  const [ledger, setLedger] = useState<LocalLedger | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState('all');

  useEffect(() => {
        syncLedgerNow().then((value) => {
      setLedger(value);
      setSelectedBatchId((current) => current === 'all'
        ? value.batches.find((batch) => batch.status === 'active')?.id ?? 'all'
        : current);
    }).catch(() => {});
  }, []);

  const report = useMemo(() => {
    if (!ledger) return null;
    const expenses = ledger.expenses.filter((item) => selectedBatchId === 'all'
      ? !item.batchId || ledger.batches.some((batch) => batch.id === item.batchId)
      : item.batchId === selectedBatchId);
    const sales = ledger.sales.filter((item) => selectedBatchId === 'all'
      ? !item.batchId || ledger.batches.some((batch) => batch.id === item.batchId)
      : item.batchId === selectedBatchId);
    const feeds = expenses.filter(isFeed);
    const feedRows = feeds.map((item) => {
      const kg = round2(item.qty * num(item.kgPerUnit));
      return {
        id: item.id,
        name: item.itemName || item.description || item.category,
        quantity: item.qty,
        kgPerUnit: num(item.kgPerUnit),
        kg,
        amount: item.lineTotal,
        pricePerKg: kg > 0 ? item.lineTotal / kg : null
      };
    });
    const feedCost = round2(feeds.reduce((sum, item) => sum + item.lineTotal, 0));
    const feedKg = round2(feedRows.reduce((sum, item) => sum + item.kg, 0));
    const salesTotal = round2(sales.reduce((sum, item) => sum + item.gross, 0));
    const salesWeight = round2(sales.reduce((sum, item) => sum + item.weightKg, 0));
    const piglets = expenses.filter((item) => isType(item, 'piglets'));
    const medication = expenses.filter((item) => ['medicine', 'medication'].includes((item.expenseType || '').toLowerCase()));
    const electricity = expenses.filter(isElectricity);
    const classified = new Set([...feeds, ...piglets, ...medication, ...electricity].map((item) => item.id));
    const other = expenses.filter((item) => !classified.has(item.id));
    const sum = (items: ReportExpense[]) => round2(items.reduce((total, item) => total + item.lineTotal, 0));
    const pigletHeads = piglets.reduce((total, item) => total + (item.unit.toLowerCase() === 'head' ? item.qty : 0), 0);
    const batch = ledger.batches.find((item) => item.id === selectedBatchId);
    const headCount = batch?.initialHeads || ledger.farm.pigCount;
    const totalCosts = round2(sum(expenses));
    const netProfit = round2(salesTotal - totalCosts);
    return {
      batch, feedRows, feedCost, feedKg, sales, salesTotal, salesWeight,
      pigletCost: sum(piglets), pigletHeads, medicationCost: sum(medication),
      electricityCost: sum(electricity), otherCost: sum(other), totalCosts,
      netProfit, profitPerHead: headCount > 0 ? Math.round(netProfit / headCount) : null,
      headCount
    };
  }, [ledger, selectedBatchId]);

  if (!ledger || !report) return <div className="card text-center"><p className="muted">Loading reports…</p></div>;

  return (
    <div className="space-y-4 print:space-y-3">
      <div className="overflow-hidden rounded-2xl bg-emerald-950 text-white shadow-sm print:bg-white print:text-slate-950 print:shadow-none">
        <div className="p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300 print:text-emerald-800">Pig Farm Ledger · Financial Statement</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-2xl font-bold tracking-tight">Farm Report</h2><p className="mt-1 text-sm text-emerald-100 print:text-slate-600">{report.batch?.name || 'All batches and farm-wide records'}</p></div>
            <button type="button" onClick={() => window.print()} className="rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10 print:hidden">Print / Save PDF</button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Highlight label="Feed cost" value={fmt(report.feedCost)} />
            <Highlight label="Feed purchased" value={fmtKg(report.feedKg)} />
            <Highlight label="Total sales" value={fmt(report.salesTotal)} />
            <Highlight label="Total costs" value={fmt(report.totalCosts)} />
          </div>
        </div>
      </div>

      <SyncStatus pending={ledger.pending.length} syncError={ledger.syncError} onSync={async () => setLedger(await syncLedgerNow())} />
      <label className="block print:hidden"><span className="label">Report scope</span>
        <select className="input" value={selectedBatchId} onChange={(event) => setSelectedBatchId(event.target.value)}>
          <option value="all">All batches and farm-wide records</option>
          {ledger.batches.filter((batch) => batch.status !== 'archived').map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
        </select>
      </label>

      <section className="card space-y-3">
        <div><h3 className="font-bold text-slate-900">Feed breakdown</h3><p className="text-xs text-slate-500">Quantity, unit weight, cost per kilogram, and total feed used.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-3">Feed name</th><th className="py-2 pr-3 text-right">Quantity</th><th className="py-2 pr-3 text-right">Price/kg</th><th className="py-2 pr-3 text-right">Amount</th><th className="py-2 text-right">Purchased kg</th></tr></thead>
            <tbody>
              {report.feedRows.length ? report.feedRows.map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="py-3 pr-3 font-medium">{item.name}</td><td className="py-3 pr-3 text-right tabular-nums">{item.quantity} × {item.kgPerUnit || '—'} kg</td><td className="py-3 pr-3 text-right tabular-nums">{item.pricePerKg === null ? '—' : fmt(item.pricePerKg)}</td><td className="py-3 pr-3 text-right tabular-nums">{fmt(item.amount)}</td><td className="py-3 text-right tabular-nums">{fmtKg(item.kg)}</td></tr>) : <tr><td colSpan={5} className="py-5 text-center text-slate-500">No feed purchases recorded for this report.</td></tr>}
            </tbody>
            <tfoot><tr className="font-bold"><td className="pt-3 pr-3">Total</td><td></td><td></td><td className="pt-3 pr-3 text-right">{fmt(report.feedCost)}</td><td className="pt-3 text-right">{fmtKg(report.feedKg)}</td></tr></tfoot>
          </table>
        </div>
      </section>

      <section className="card space-y-3">
        <div><h3 className="font-bold text-slate-900">Sales summary</h3><p className="text-xs text-slate-500">Recorded pig sales and realized revenue.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-3">Date / Buyer</th><th className="py-2 pr-3 text-right">Weight kg</th><th className="py-2 pr-3 text-right">Price/kg</th><th className="py-2 text-right">Amount</th></tr></thead>
            <tbody>{report.sales.length ? report.sales.map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="py-3 pr-3"><span className="block font-medium">{item.buyer || 'Buyer not specified'}</span><span className="text-xs text-slate-500">{item.date} · {item.heads} head(s)</span></td><td className="py-3 pr-3 text-right tabular-nums">{fmtKg(item.weightKg)}</td><td className="py-3 pr-3 text-right tabular-nums">{fmt(item.pricePerKg)}</td><td className="py-3 text-right tabular-nums">{fmt(item.gross)}</td></tr>) : <tr><td colSpan={4} className="py-5 text-center text-slate-500">No sales recorded for this report.</td></tr>}</tbody>
            <tfoot><tr className="font-bold"><td className="pt-3 pr-3">Total sales</td><td className="pt-3 pr-3 text-right">{fmtKg(report.salesWeight)}</td><td></td><td className="pt-3 text-right">{fmt(report.salesTotal)}</td></tr></tfoot>
          </table>
        </div>
      </section>

      <section className="card space-y-3">
        <div><h3 className="font-bold text-slate-900">Costs summary</h3><p className="text-xs text-slate-500">Actual expenses recorded and assigned to this report.</p></div>
        <CostLine label="Feeds" value={report.feedCost} />
        <CostLine label={`Piglets · ${report.pigletHeads || report.headCount} head(s)`} value={report.pigletCost} />
        <CostLine label="Medication" value={report.medicationCost} />
        <CostLine label="Electricity" value={report.electricityCost} />
        <CostLine label="Other / operating costs" value={report.otherCost} />
        <div className="flex items-center justify-between border-t border-slate-200 pt-3 font-bold"><span>Total cost</span><span className="tabular-nums">{fmt(report.totalCosts)}</span></div>
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Final result</p>
        <div className="mt-3 flex items-end justify-between gap-3"><div><p className="text-sm font-medium text-emerald-900">Net profit</p><p className={'mt-1 text-3xl font-extrabold tabular-nums ' + (report.netProfit < 0 ? 'text-rose-700' : 'text-emerald-950')}>{fmt(report.netProfit)}</p></div><div className="text-right"><p className="text-xs text-emerald-800">Profit per head (using recorded herd size)</p><p className="mt-1 text-xl font-bold tabular-nums text-emerald-950">{report.profitPerHead === null ? '—' : fmt(report.profitPerHead)}</p><p className="text-[11px] text-emerald-800">{report.headCount} head(s) used</p></div></div>
      </section>
      <p className="px-1 text-xs text-slate-500">Feed kilograms represent purchased weight calculated from quantity × kilograms per unit. This report does not measure feed consumption; purchases are counted once as expenses.</p>
    </div>
  );
}

function Highlight({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-3 print:border-slate-200 print:bg-slate-50"><p className="text-[11px] font-medium text-emerald-100 print:text-slate-500">{label}</p><p className="mt-1 text-lg font-bold tabular-nums text-white print:text-slate-900">{value}</p></div>;
}

function CostLine({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-600">{label}</span><strong className="tabular-nums text-slate-900">{fmt(value)}</strong></div>;
}
