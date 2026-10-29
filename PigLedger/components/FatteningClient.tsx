'use client';

import { useEffect, useState } from 'react';
import { fmt, fmtKg, num, round2 } from '@/lib/format';
import { computeFattening } from '@/lib/totals';
import { loadLocalLedger, saveLocalLedger } from '@/lib/local-store';

const DEFAULT_FEEDS = [
  { id: 'f1', name: 'Booster Pellets', bags: 10, kgPerBag: 90, pricePerBag: 130 },
  { id: 'f2', name: 'PPSP', bags: 13, kgPerBag: 1340, pricePerBag: 130 },
  { id: 'f3', name: 'PSP', bags: 12, kgPerBag: 1940, pricePerBag: 130 },
  { id: 'f4', name: 'P&P', bags: 31, kgPerBag: 1790, pricePerBag: 130 },
  { id: 'f5', name: 'PPF', bags: 7, kgPerBag: 1690, pricePerBag: 130 }
];

const DEFAULT_SALES = [
  { id: 's1', weightKg: 645, pricePerKg: 130 },
  { id: 's2', weightKg: 630, pricePerKg: 130 }
];

export default function FatteningClient() {
  const [ledger, setLedger] = useState(null);
  const [heads, setHeads] = useState(12);
  const [feeds, setFeeds] = useState([...DEFAULT_FEEDS]);
  const [sales, setSales] = useState([...DEFAULT_SALES]);
  const summary = computeFattening(feeds, sales, heads);

  useEffect(() => {
    const init = async () => {
      await loadLocalLedger().then(setLedger);
      const local = await loadLocalLedger();
      local.fattening = { feeds, sales, heads };
      await saveLocalLedger(local);
    };
    init();
  }, [feeds, sales, heads]);

  if (!ledger) return <div className="card text-center">Loading…</div>;

  const updateFeed = (idx, field, value) =>
    setFeeds(prev => { const newFeeds = [...prev]; newFeeds[idx] = { ...newFeeds[idx], [field]: value }; return newFeeds; });

  const updateSale = (idx, field, value) =>
    setSales(prev => { const newSales = [...prev]; newSales[idx] = { ...newSales[idx], [field]: value }; return newSales; });

  return (
    <div className="space-y-4">
      <p>Heads: <input type="number" value={heads} onChange={(e) => setHeads(num(e.target.value))} inputMode="numeric" min="1" step="1" className="input" /></p>
      <p>Total Feed Cost: {fmt(summary.totalFeedCost)} ({fmtKg(summary.totalFeedKg)} kg)</p>
      <p>Total Sales: {fmt(summary.totalSales)}</p>
      <p>Net Profit: {fmt(summary.netProfit)}</p>
      <p className="profit-per-head">
        Profit per Head: {summary.profitPerHead === null ? '—' : fmt(summary.profitPerHead)} / head
      </p>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left p-2 font-semibold text-slate-500">Feed</th>
            <th className="text-center p-2 font-semibold text-slate-500">Bags</th>
            <th className="text-center p-2 font-semibold text-slate-500">kg/bag</th>
            <th className="text-center p-2 font-semibold text-slate-500">Price/bag (₱)</th>
            <th className="text-center p-2 font-semibold text-slate-500">Amount (₱)</th>
            <th className="text-center p-2 font-semibold text-slate-500">Total kg</th>
          </tr>
        </thead>
        <tbody>
          {feeds.map((f, i) => (
            <tr key={f.id} className="border-b border-slate-200">
              <td className="p-2">{f.name}</td>
              <td className="text-center p-2"><input type="number" value={f.bags} onChange={(e) => updateFeed(i, 'bags', num(e.target.value))} inputMode="numeric" min="0" step="1" className="input w-full" /></td>
              <td className="text-center p-2"><input type="number" value={f.kgPerBag} onChange={(e) => updateFeed(i, 'kgPerBag', num(e.target.value))} inputMode="decimal" min="0" step="any" className="input w-full" /></td>
              <td className="text-center p-2"><input type="number" value={f.pricePerBag} onChange={(e) => updateFeed(i, 'pricePerBag', num(e.target.value))} inputMode="decimal" min="0" step="0.01" className="input w-full" /></td>
              <td className="text-center p-2">{fmt(round2(f.bags * f.pricePerBag))}</td>
              <td className="text-center p-2">{fmtKg(round2(f.bags * f.kgPerBag))}</td>
            </tr>
          ))}
          <tr className="border-b border-slate-200"><td colSpan="6" className="p-2 text-slate-400">Enter feed details above</td></tr>
        </tbody>
      </table>

      <table className="w-full text-sm mt-4">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left p-2 font-semibold text-slate-500">Description</th>
            <th className="text-center p-2 font-semibold text-slate-500">Weight (kg)</th>
            <th className="text-center p-2 font-semibold text-slate-500">Price / kg (₱)</th>
            <th className="text-center p-2 font-semibold text-slate-500">Amount (₱)</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((s, i) => (
            <tr key={s.id} className="border-b border-slate-200">
              <td className="p-2">{s.id}</td>
              <td className="text-center p-2"><input type="number" value={s.weightKg} onChange={(e) => updateSale(i, 'weightKg', num(e.target.value))} inputMode="decimal" min="0" step="any" className="input w-full" /></td>
              <td className="text-center p-2"><input type="number" value={s.pricePerKg} onChange={(e) => updateSale(i, 'pricePerKg', num(e.target.value))} inputMode="decimal" min="0" step="0.01" className="input w-full" /></td>
              <td className="text-center p-2">{fmt(round2(s.weightKg * s.pricePerKg))}</td>
            </tr>
          ))}
          <tr className="border-b border-slate-200"><td colSpan="4" className="p-2 text-slate-400">Enter sale details above</td></tr>
        </tbody>
      </table>

      <p>Net Profit: {fmt(summary.netProfit)}</p>
      <p className="profit-per-head">
        Profit per Head: {summary.profitPerHead === null ? '—' : fmt(summary.profitPerHead)} / head
      </p>
    </div>
  );
}
