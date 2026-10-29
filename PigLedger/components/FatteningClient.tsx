'use client';

import { useState, useEffect } from 'react';

interface FeedItem {
  id: string;
  name: string;
  bags: number;
  kgPerBag: number;
  pricePerBag: number;
}

interface SaleItem {
  id: string;
  weightKg: number;
  pricePerKg: number;
}

interface FatteningData {
  feeds: FeedItem[];
  sales: SaleItem[];
  heads: number;
}

interface LocalLedger {
  fattening?: FatteningData;
  [key: string]: any;
}

interface FatteningClientProps {
  next?: string | null;
}

const DEFAULT_FEEDS: FeedItem[] = [
  { id: 'starter', name: 'Starter', bags: 2, kgPerBag: 50, pricePerBag: 1800 },
  { id: 'grower', name: 'Grower', bags: 5, kgPerBag: 50, pricePerBag: 1650 },
  { id: 'finisher', name: 'Finisher', bags: 8, kgPerBag: 50, pricePerBag: 1550 },
];

const DEFAULT_SALES: SaleItem[] = [
  { id: 'Batch 1', weightKg: 95, pricePerKg: 120 },
];

const num = (val: string | number) => (val === '' ? 0 : Number(val));
const round2 = (val: number) => Math.round(val * 100) / 100;
const fmt = (val: number) => val.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
const fmtKg = (val: number) => val.toLocaleString('en-PH', { maximumFractionDigits: 2 });

import { loadLocalLedger, saveLocalLedger } from '@/lib/ledger';

export default function FatteningClient({ next }: FatteningClientProps) {
  const [ledger, setLedger] = useState<LocalLedger | null>(null);
  const [heads, setHeads] = useState<number>(12);
  const [feeds, setFeeds] = useState<FeedItem[]>([...DEFAULT_FEEDS]);
  const [sales, setSales] = useState<SaleItem[]>([...DEFAULT_SALES]);

  useEffect(() => {
    const init = async () => {
      const raw = await loadLocalLedger();
      const local = (raw || {}) as LocalLedger;
      setLedger(local);
      if (local.fattening) {
        if (local.fattening.heads) setHeads(local.fattening.heads);
        if (local.fattening.feeds) setFeeds(local.fattening.feeds);
        if (local.fattening.sales) setSales(local.fattening.sales);
      }
    };
    init();
  }, []);

  useEffect(() => {
    const sync = async () => {
      const raw = await loadLocalLedger();
      const local = (raw || {}) as LocalLedger;
      local.fattening = { feeds, sales, heads };
      await saveLocalLedger(local);
    };
    sync();
  }, [feeds, sales, heads]);

  const totalFeedCost = feeds.reduce((acc, f) => acc + f.bags * f.pricePerBag, 0);
  const totalFeedKg = feeds.reduce((acc, f) => acc + f.bags * f.kgPerBag, 0);
  const totalSales = sales.reduce((acc, s) => acc + s.weightKg * s.pricePerKg, 0);
  const netProfit = totalSales - totalFeedCost;
  const profitPerHead = heads > 0 ? netProfit / heads : 0;

  const summary = {
    totalFeedCost,
    totalFeedKg,
    totalSales,
    netProfit,
    profitPerHead,
  };

  const updateFeed = (index: number, field: keyof FeedItem, value: any) => {
    const updated = [...feeds];
    updated[index] = { ...updated[index], [field]: value };
    setFeeds(updated);
  };

  const updateSale = (index: number, field: keyof SaleItem, value: any) => {
    const updated = [...sales];
    updated[index] = { ...updated[index], [field]: value };
    setSales(updated);
  };

  if (!ledger) return <div className="card text-center p-6">Loading…</div>;

  return (
    <div className="space-y-4 p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">Fattening Computation</h1>

      <div className="card bg-white p-4 shadow rounded space-y-4">
        <p className="flex items-center gap-2">
          <span>Heads:</span>
          <input
            type="number"
            value={heads}
            onChange={(e) => setHeads(num(e.target.value))}
            inputMode="numeric"
            min="1"
            step="1"
            className="input border p-1 rounded w-24"
          />
        </p>

        <p>Total Feed Cost: {fmt(summary.totalFeedCost)} ({fmtKg(summary.totalFeedKg)} kg)</p>
        <p>Total Sales: {fmt(summary.totalSales)}</p>
        <p>Net Profit: {fmt(summary.netProfit)}</p>
        <p className={summary.profitPerHead >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
          Profit per Head: {summary.profitPerHead === null ? '—' : fmt(summary.profitPerHead)} / head
        </p>

        {/* Feeds Table */}
        <div className="overflow-x-auto">
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
                  <td className="text-center p-2">
                    <input
                      type="number"
                      value={f.bags}
                      onChange={(e) => updateFeed(i, 'bags', num(e.target.value))}
                      inputMode="numeric"
                      min="0"
                      step="1"
                      className="input border p-1 rounded w-full"
                    />
                  </td>
                  <td className="text-center p-2">
                    <input
                      type="number"
                      value={f.kgPerBag}
                      onChange={(e) => updateFeed(i, 'kgPerBag', num(e.target.value))}
                      inputMode="decimal"
                      min="0"
                      step="any"
                      className="input border p-1 rounded w-full"
                    />
                  </td>
                  <td className="text-center p-2">
                    <input
                      type="number"
                      value={f.pricePerBag}
                      onChange={(e) => updateFeed(i, 'pricePerBag', num(e.target.value))}
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      className="input border p-1 rounded w-full"
                    />
                  </td>
                  <td className="text-center p-2">{fmt(round2(f.bags * f.pricePerBag))}</td>
                  <td className="text-center p-2">{fmtKg(round2(f.bags * f.kgPerBag))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sales Table */}
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm">
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
                  <td className="text-center p-2">
                    <input
                      type="number"
                      value={s.weightKg}
                      onChange={(e) => updateSale(i, 'weightKg', num(e.target.value))}
                      inputMode="decimal"
                      min="0"
                      step="any"
                      className="input border p-1 rounded w-full"
                    />
                  </td>
                  <td className="text-center p-2">
                    <input
                      type="number"
                      value={s.pricePerKg}
                      onChange={(e) => updateSale(i, 'pricePerKg', num(e.target.value))}
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      className="input border p-1 rounded w-full"
                    />
                  </td>
                  <td className="text-center p-2">{fmt(round2(s.weightKg * s.pricePerKg))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
