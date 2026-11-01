'use client';

import { useEffect, useMemo, useState } from 'react';
import SyncStatus from '@/components/SyncStatus';
import { fmt, fmtDate, fmtKg, num, round2, today } from '@/lib/format';
import { FEED_CATEGORIES } from '@/lib/types';
import { loadLocalLedger, type LocalLedger } from '@/lib/local-store';
import { syncLedgerNow } from '@/components/ExpensesClient';
import { calculateReportFinancials, groupDailyCashflow } from '@/lib/report-math.mjs';
import { calculatePopulation } from '@/lib/farm-operations.mjs';

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
function csvCell(value: string | number) {
  const raw = String(value ?? '');
  return '"' + raw.replace(/"/g, '""') + '"';
}
function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [ledger, setLedger] = useState<LocalLedger | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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
    const inBatch = (batchId?: string | null) => selectedBatchId === 'all'
      ? !batchId || ledger.batches.some((batch) => batch.id === batchId)
      : batchId === selectedBatchId;
    const allScopedExpenses = ledger.expenses.filter((item) => inBatch(item.batchId));
    const allScopedSales = ledger.sales.filter((item) => inBatch(item.batchId));
    const scopedSaleIds = new Set(allScopedSales.map((item) => item.id));
    const allScopedPayments = ledger.salePayments.filter((item) => scopedSaleIds.has(item.saleId));
    const expenses = allScopedExpenses.filter((item) =>
      (!dateFrom || item.date >= dateFrom) && (!dateTo || item.date <= dateTo)
    );
    const sales = allScopedSales.filter((item) =>
      (!dateFrom || item.date >= dateFrom) && (!dateTo || item.date <= dateTo)
    );
    const payments = allScopedPayments.filter((item) =>
      (!dateFrom || item.paymentDate >= dateFrom) && (!dateTo || item.paymentDate <= dateTo)
    );
    const consumptions = ledger.feedConsumption.filter((item) =>
      inBatch(item.batchId) &&
      (!dateFrom || item.consumptionDate >= dateFrom) &&
      (!dateTo || item.consumptionDate <= dateTo)
    );
    const feedProducts = new Map(ledger.feedProducts.map((product) => [product.id, product]));
    const feeds = expenses.filter(isFeed);
    const feedRows = feeds.map((item) => {
      const kg = round2(item.qty * num(item.kgPerUnit));
      return {
        id: item.id,
        name: item.itemName || item.description || item.category,
        quantity: item.qty,
        unit: item.unit,
        kgPerUnit: num(item.kgPerUnit),
        kg,
        amount: item.lineTotal,
        pricePerKg: kg > 0 ? item.lineTotal / kg : null
      };
    });
    const feedCost = round2(feeds.reduce((sum, item) => sum + item.lineTotal, 0));
    const purchasedKg = round2(feedRows.reduce((sum, item) => sum + item.kg, 0));
    const consumedKg = round2(consumptions.reduce((sum, item) => sum + item.quantityUnits * item.kgPerUnitSnapshot, 0));
    const consumptionRows = consumptions.map((item) => ({
      ...item,
      productName: feedProducts.get(item.productId)?.name ?? 'Feed product',
      batchName: ledger.batches.find((batch) => batch.id === item.batchId)?.name ?? 'Batch',
      kg: round2(item.quantityUnits * item.kgPerUnitSnapshot)
    }));
    const financial = calculateReportFinancials({
      expenses: allScopedExpenses,
      sales: allScopedSales,
      payments: allScopedPayments,
      dateFrom,
      dateTo
    });
    const piglets = expenses.filter((item) => isType(item, 'piglets'));
    const medication = expenses.filter((item) => ['medicine', 'medication'].includes((item.expenseType || '').toLowerCase()));
    const electricity = expenses.filter(isElectricity);
    const classified = new Set([...feeds, ...piglets, ...medication, ...electricity].map((item) => item.id));
    const other = expenses.filter((item) => !classified.has(item.id));
    const sum = (items: ReportExpense[]) => round2(items.reduce((total, item) => total + item.lineTotal, 0));
    const pigletHeads = piglets.reduce((total, item) => total + (item.unit.toLowerCase() === 'head' ? item.qty : 0), 0);
    const batch = ledger.batches.find((item) => item.id === selectedBatchId);
    let headCount = batch?.initialHeads || ledger.farm.pigCount;
    if (batch) {
      const movements = ledger.populationMovements.filter((item) =>
        item.batchId === batch.id && (!dateTo || item.movementDate <= dateTo)
      );
      const opening = movements.some((item) => item.movementType === 'opening') ? [] : [{
        id: 'report-opening-' + batch.id,
        farmId: batch.farmId,
        batchId: batch.id,
        movementDate: batch.startDate,
        movementType: 'opening' as const,
        heads: batch.initialHeads,
        notes: ''
      }];
      const salesToDate = allScopedSales.filter((item) => item.batchId === batch.id && (!dateTo || item.date <= dateTo));
      headCount = Math.max(0, calculatePopulation([...opening, ...movements], salesToDate).currentHeads);
    }
    const netProfit = financial.netProfit;
    const cashflow = groupDailyCashflow(expenses, sales);
    const projection = batch?.projection;
    const projectedRevenue = projection
      ? projection.plannedHeads * projection.expectedAvgSaleWeightKg * projection.expectedPricePerKg
      : null;
    const projectedCosts = projection
      ? projection.plannedHeads * projection.pigletPricePerHead + projection.projectedFeedCost + projection.projectedOtherCosts
      : null;
    const projectedProfit = projectedRevenue !== null && projectedCosts !== null
      ? round2(projectedRevenue - projectedCosts)
      : null;

    return {
      batch,
      expenses,
      sales,
      payments,
      feeds,
      feedRows,
      feedCost,
      purchasedKg,
      consumedKg,
      consumptionRows,
      salesWeight: round2(sales.reduce((sum, item) => sum + item.weightKg, 0)),
      pigletCost: sum(piglets),
      pigletHeads,
      medicationCost: sum(medication),
      electricityCost: sum(electricity),
      otherCost: sum(other),
      totalCosts: financial.totalCosts,
      salesTotal: financial.salesRevenue,
      cashReceived: financial.cashReceived,
      receivables: financial.receivables,
      netProfit,
      profitPerHead: headCount > 0 ? netProfit / headCount : null,
      headCount,
      cashflow,
      projectedRevenue,
      projectedCosts,
      projectedProfit,
      financial
    };
  }, [ledger, selectedBatchId, dateFrom, dateTo]);

  if (!ledger || !report) return <div className="card text-center"><p className="muted">Loading reports…</p></div>;

  const dateRangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const maxCashflow = Math.max(1, ...report.cashflow.map((item) => Math.max(item.revenue, item.expenses)));
  const csvRows: Array<Array<string | number>> = [
    ['Record type', 'Date', 'Batch', 'Description', 'Quantity', 'Unit', 'Weight / kg', 'Expense / PHP', 'Revenue / PHP', 'Cash received / PHP', 'Notes']
  ];
  for (const expense of report.expenses) {
    csvRows.push([
      'Expense', expense.date, ledger.batches.find((batch) => batch.id === expense.batchId)?.name ?? 'Farm-wide',
      expense.description, expense.qty, expense.unit, round2(expense.qty * num(expense.kgPerUnit)),
      expense.lineTotal, '', '', expense.supplierId ? ledger.suppliers.find((supplier) => supplier.id === expense.supplierId)?.name ?? '' : ''
    ]);
  }
  for (const sale of report.sales) {
    csvRows.push([
      'Sale', sale.date, ledger.batches.find((batch) => batch.id === sale.batchId)?.name ?? 'Farm-wide',
      sale.customerId ? ledger.customers.find((customer) => customer.id === sale.customerId)?.name ?? sale.buyer : sale.buyer,
      sale.heads, 'head', sale.weightKg, '', sale.gross, '', ''
    ]);
  }
  for (const item of report.consumptionRows) {
    csvRows.push(['Feed consumption', item.consumptionDate, item.batchName, item.productName, item.quantityUnits, 'unit', item.kg, '', '', '', item.notes]);
  }
  for (const payment of report.payments) {
    const sale = ledger.sales.find((item) => item.id === payment.saleId);
    csvRows.push([
      'Sale payment', payment.paymentDate, ledger.batches.find((batch) => batch.id === sale?.batchId)?.name ?? 'Farm-wide',
      ledger.customers.find((customer) => customer.id === sale?.customerId)?.name ?? sale?.buyer ?? 'Customer',
      '', payment.paymentMethod, '', '', '', payment.amount, payment.reference || payment.notes
    ]);
  }

  return (
    <div className="space-y-4 print:space-y-3">
      <div className="overflow-hidden rounded-2xl bg-emerald-950 text-white shadow-sm print:bg-white print:text-slate-950 print:shadow-none">
        <div className="p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300 print:text-emerald-800">Pig Farm Ledger · Financial Statement</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Farm Report</h2>
              <p className="mt-1 text-sm text-emerald-100 print:text-slate-600">{report.batch?.name || 'All batches and farm-wide records'}</p>
              <p className="mt-1 text-xs text-emerald-200 print:text-slate-500">
                {dateFrom || 'Beginning'} to {dateTo || 'Current'}
              </p>
            </div>
            <div className="flex gap-2 print:hidden">
              <button type="button" onClick={() => downloadCsv('pig-ledger-report-' + today() + '.csv', csvRows)} disabled={dateRangeInvalid} className="rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50">Export CSV</button>
              <button type="button" onClick={() => window.print()} className="rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10">Print / Save PDF</button>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Highlight label="Sales revenue" value={fmt(report.salesTotal)} />
            <Highlight label="Costs" value={fmt(report.totalCosts)} />
            <Highlight label="Cash received" value={fmt(report.cashReceived)} />
            <Highlight label="Receivables" value={fmt(report.receivables)} />
          </div>
        </div>
      </div>

      <SyncStatus pending={ledger.pending.length} syncError={ledger.syncError} onSync={async () => setLedger(await syncLedgerNow())} />
      <section className="card space-y-3 print:hidden">
        <div><h3 className="font-semibold">Report filters</h3><p className="text-xs text-slate-500">Filter sales and expenses by transaction date. Receivables are calculated as of the report end date.</p></div>
        <label className="block"><span className="label">Report scope</span>
          <select className="input" value={selectedBatchId} onChange={(event) => setSelectedBatchId(event.target.value)}>
            <option value="all">All batches and farm-wide records</option>
            {ledger.batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}{batch.status === 'archived' ? ' · Archived' : ''}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label><span className="label">From date</span><input className="input" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label><span className="label">To date</span><input className="input" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></label>
        </div>
        <div className="flex justify-between gap-3">
          <p className="text-xs text-slate-500">{report.expenses.length} expense(s) · {report.sales.length} sale(s)</p>
          <button type="button" className="text-sm font-semibold text-slate-600 underline" onClick={() => { setDateFrom(''); setDateTo(''); setSelectedBatchId('all'); }}>Reset filters</button>
        </div>
        {dateRangeInvalid ? <p role="alert" className="text-sm text-rose-700">The start date must not be after the end date.</p> : null}
      </section>

      <section className="card space-y-3">
        <div><h3 className="font-bold text-slate-900">Feed inventory and use</h3><p className="text-xs text-slate-500">Purchases and actual consumption are different records and are reported separately.</p></div>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Feed purchased" value={fmtKg(report.purchasedKg)} />
          <Metric label="Feed consumed" value={fmtKg(report.consumedKg)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-3">Feed name</th><th className="py-2 pr-3 text-right">Quantity</th><th className="py-2 pr-3 text-right">Price/kg</th><th className="py-2 pr-3 text-right">Cost</th><th className="py-2 text-right">Purchased kg</th></tr></thead>
            <tbody>
              {report.feedRows.length ? report.feedRows.map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="py-3 pr-3 font-medium">{item.name}</td><td className="py-3 pr-3 text-right tabular-nums">{item.quantity} {item.unit} · {item.kgPerUnit || '—'} kg/unit</td><td className="py-3 pr-3 text-right tabular-nums">{item.pricePerKg === null ? '—' : fmt(item.pricePerKg)}</td><td className="py-3 pr-3 text-right tabular-nums">{fmt(item.amount)}</td><td className="py-3 text-right tabular-nums">{fmtKg(item.kg)}</td></tr>) : <tr><td colSpan={5} className="py-5 text-center text-slate-500">No feed purchases recorded for this report.</td></tr>}
            </tbody>
            <tfoot><tr className="font-bold"><td className="pt-3 pr-3">Total</td><td></td><td></td><td className="pt-3 pr-3 text-right">{fmt(report.feedCost)}</td><td className="pt-3 text-right">{fmtKg(report.purchasedKg)}</td></tr></tfoot>
          </table>
        </div>
        {report.consumptionRows.length ? (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <h4 className="text-sm font-semibold">Actual consumption by product and batch</h4>
            {report.consumptionRows.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 text-sm"><div className="min-w-0"><p className="truncate font-medium">{item.productName}</p><p className="text-xs text-slate-500">{item.batchName} · {fmtDate(item.consumptionDate)}</p></div><strong className="shrink-0 tabular-nums">{fmtKg(item.kg)}</strong></div>)}
          </div>
        ) : <p className="text-xs text-slate-500">No actual feed consumption records in this date range.</p>}
      </section>

      <section className="card space-y-3">
        <div><h3 className="font-bold text-slate-900">Sales and collections</h3><p className="text-xs text-slate-500">Sales are revenue; payments are cash receipts. A sale can have several partial payments.</p></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric label="Sales in period" value={fmt(report.salesTotal)} />
          <Metric label="Received in period" value={fmt(report.cashReceived)} />
          <Metric label="Outstanding as of end date" value={fmt(report.receivables)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-3">Date / Buyer</th><th className="py-2 pr-3 text-right">Weight</th><th className="py-2 pr-3 text-right">Revenue</th><th className="py-2 pr-3 text-right">Paid</th><th className="py-2 text-right">Balance</th></tr></thead>
            <tbody>{report.sales.length ? report.sales.map((item) => {
              const paid = round2(ledger.salePayments.filter((payment) => payment.saleId === item.id && (!dateTo || payment.paymentDate <= dateTo)).reduce((sum, payment) => sum + payment.amount, 0));
              const balance = Math.max(0, round2(item.gross - paid));
              return <tr key={item.id} className="border-b border-slate-100"><td className="py-3 pr-3"><span className="block font-medium">{ledger.customers.find((customer) => customer.id === item.customerId)?.name || item.buyer || 'Buyer not specified'}</span><span className="text-xs text-slate-500">{fmtDate(item.date)} · {item.heads} head(s)</span></td><td className="py-3 pr-3 text-right tabular-nums">{fmtKg(item.weightKg)}</td><td className="py-3 pr-3 text-right tabular-nums">{fmt(item.gross)}</td><td className="py-3 pr-3 text-right tabular-nums">{fmt(paid)}</td><td className="py-3 text-right tabular-nums">{fmt(balance)}</td></tr>;
            }) : <tr><td colSpan={5} className="py-5 text-center text-slate-500">No sales in this date range.</td></tr>}</tbody>
          </table>
        </div>
      </section>

      <section className="card space-y-3">
        <div><h3 className="font-bold text-slate-900">Daily revenue and costs</h3><p className="text-xs text-slate-500">Bars are scaled to the largest daily value in the selected period.</p></div>
        {report.cashflow.length ? report.cashflow.map((day) => (
          <div key={day.date} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium text-slate-600">{fmtDate(day.date)}</span><span className="tabular-nums text-slate-500">Revenue {fmt(day.revenue)} · Costs {fmt(day.expenses)}</span></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: (day.revenue / maxCashflow * 100) + '%' }} /></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-500" style={{ width: (day.expenses / maxCashflow * 100) + '%' }} /></div>
            </div>
          </div>
        )) : <p className="muted">No financial transactions in this date range.</p>}
      </section>

      {report.batch && report.projectedRevenue !== null && report.projectedCosts !== null && report.projectedProfit !== null ? (
        <section className="card space-y-3">
          <div><h3 className="font-bold text-slate-900">Projected vs actual</h3><p className="text-xs text-slate-500">Projection covers the full batch plan; actuals reflect the selected date range.</p></div>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Projected revenue" value={fmt(report.projectedRevenue)} />
            <Metric label="Actual revenue in period" value={fmt(report.salesTotal)} />
            <Metric label="Projected costs" value={fmt(report.projectedCosts)} />
            <Metric label="Actual costs in period" value={fmt(report.totalCosts)} />
            <Metric label="Projected profit" value={fmt(report.projectedProfit)} />
            <Metric label="Actual net in period" value={fmt(report.netProfit)} />
          </div>
        </section>
      ) : null}

      <section className="card space-y-3">
        <div><h3 className="font-bold text-slate-900">Costs summary</h3><p className="text-xs text-slate-500">Actual expenses recorded in the selected scope and period.</p></div>
        <CostLine label="Feed purchases" value={report.feedCost} />
        <CostLine label={`Piglets · ${report.pigletHeads || report.headCount} head(s)`} value={report.pigletCost} />
        <CostLine label="Medication" value={report.medicationCost} />
        <CostLine label="Electricity" value={report.electricityCost} />
        <CostLine label="Other / operating costs" value={report.otherCost} />
        <div className="flex items-center justify-between border-t border-slate-200 pt-3 font-bold"><span>Total cost</span><span className="tabular-nums">{fmt(report.totalCosts)}</span></div>
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 print:bg-white">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Period result</p>
        <div className="mt-3 flex items-end justify-between gap-3"><div><p className="text-sm font-medium text-emerald-900">Net profit (revenue − recorded expenses)</p><p className={'mt-1 text-3xl font-extrabold tabular-nums ' + (report.netProfit < 0 ? 'text-rose-700' : 'text-emerald-950')}>{fmt(report.netProfit)}</p></div><div className="text-right"><p className="text-xs text-emerald-800">Profit per current recorded headcount</p><p className="mt-1 text-xl font-bold tabular-nums text-emerald-950">{report.profitPerHead === null ? '—' : fmt(report.profitPerHead)}</p><p className="text-[11px] text-emerald-800">{report.headCount} head(s) used</p></div></div>
      </section>
      <p className="px-1 text-xs text-slate-500">Feed purchased kilograms are calculated from purchase quantity × kilograms per unit. Feed consumed kilograms come only from actual feed-consumption records. Sales revenue is separate from cash received.</p>
    </div>
  );
}

function Highlight({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-3 print:border-slate-200 print:bg-slate-50"><p className="text-[11px] font-medium text-emerald-100 print:text-slate-500">{label}</p><p className="mt-1 text-lg font-bold tabular-nums text-white print:text-slate-900">{value}</p></div>;
}
function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-lg font-bold tabular-nums">{value}</p></div>;
}
function CostLine({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-600">{label}</span><strong className="tabular-nums text-slate-900">{fmt(value)}</strong></div>;
}
