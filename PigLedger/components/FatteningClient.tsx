'use client';

import { useEffect, useState } from "react";
import { computeFattening } from "@/lib/totals";
import { fmt, fmtKg, num, round2 } from "@/lib/format";

type FeedItem = { id: string; name: string; bags: number; kgPerBag: number; pricePerBag: number | string };
type SaleItem = { id: string; weightKg: number; pricePerKg: number | string };

const DEFAULT_FEEDS: FeedItem[] = [
  { id: "booster", name: "Booster", bags: 0, kgPerBag: 25, pricePerBag: "" },
  { id: "pre-starter", name: "Pre-Starter", bags: 0, kgPerBag: 25, pricePerBag: "" },
  { id: "starter", name: "Starter", bags: 0, kgPerBag: 25, pricePerBag: "" },
  { id: "grower", name: "Grower", bags: 0, kgPerBag: 25, pricePerBag: "" },
  { id: "finisher", name: "Finisher", bags: 0, kgPerBag: 25, pricePerBag: "" }
];
const DEFAULT_SALES: SaleItem[] = [{ id: "sale-1", weightKg: 0, pricePerKg: "" }];

interface FatteningClientProps {
  next?: string | null;
}

export default function FatteningClient({ next }: FatteningClientProps) {
  const [ledger, setLedger] = useState(false);
  const [heads, setHeads] = useState(12);
  const [feeds, setFeeds] = useState([...DEFAULT_FEEDS]);
  const [sales, setSales] = useState([...DEFAULT_SALES]);
  const [pigletPricePerHead, setPigletPricePerHead] = useState("");
  const [medicationCost, setMedicationCost] = useState("");
  const [electricityCost, setElectricityCost] = useState("");
  const summary = computeFattening(
    feeds,
    sales,
    heads,
    num(pigletPricePerHead),
    num(medicationCost),
    num(electricityCost)
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("pig-ledger-fattening-v1");
      if (raw) {
        const saved = JSON.parse(raw) as {
          heads?: number;
          feeds?: FeedItem[];
          sales?: SaleItem[];
          pigletPricePerHead?: string | number;
          medicationCost?: string | number;
          electricityCost?: string | number;
        };
        if (typeof saved.heads === "number") setHeads(Math.max(1, Math.floor(num(saved.heads))));
        if (Array.isArray(saved.feeds)) setFeeds(saved.feeds);
        if (Array.isArray(saved.sales)) setSales(saved.sales);
        if (saved.pigletPricePerHead !== undefined) setPigletPricePerHead(String(saved.pigletPricePerHead));
        if (saved.medicationCost !== undefined) setMedicationCost(String(saved.medicationCost));
        if (saved.electricityCost !== undefined) setElectricityCost(String(saved.electricityCost));
      }
    } catch {
      window.localStorage.removeItem("pig-ledger-fattening-v1");
    }
    setLedger(true);
  }, []);

  useEffect(() => {
    if (!ledger) return;
    try {
      window.localStorage.setItem(
        "pig-ledger-fattening-v1",
        JSON.stringify({ heads, feeds, sales, pigletPricePerHead, medicationCost, electricityCost })
      );
    } catch {
      return;
    }
  }, [ledger, feeds, sales, heads, pigletPricePerHead, medicationCost, electricityCost]);

  if (!ledger) return <div className="card text-center">Loading…</div>;

  const updateFeed = (idx: number, field: string, value: any) =>
    setFeeds(prev => { const newFeeds = [...prev]; newFeeds[idx] = { ...newFeeds[idx], [field]: value }; return newFeeds; });

  const updateSale = (idx: number, field: string, value: any) =>
    setSales(prev => { const newSales = [...prev]; newSales[idx] = { ...newSales[idx], [field]: value }; return newSales; });

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h2 className="section-title mb-0">Actual Farm Costs</h2>
        <p className="muted">Prices are not preset. Enter the amount you actually pay, and update it whenever prices change.</p>
        <label className="block">
          <span className="label">Number of Heads</span>
          <input type="number" value={heads} onChange={(e) => setHeads(Math.max(1, Math.floor(num(e.target.value))))} inputMode="numeric" min="1" step="1" className="input" />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>
            <span className="label">Piglet Price per Head (₱)</span>
            <input type="number" value={pigletPricePerHead} onChange={(e) => setPigletPricePerHead(e.target.value)} inputMode="decimal" min="0" step="0.01" placeholder="Enter actual price" className="input" />
          </label>
          <label>
            <span className="label">Total Medication Cost (₱)</span>
            <input type="number" value={medicationCost} onChange={(e) => setMedicationCost(e.target.value)} inputMode="decimal" min="0" step="0.01" placeholder="Enter actual cost" className="input" />
          </label>
          <label>
            <span className="label">Total Electricity Cost (₱)</span>
            <input type="number" value={electricityCost} onChange={(e) => setElectricityCost(e.target.value)} inputMode="decimal" min="0" step="0.01" placeholder="Enter actual cost" className="input" />
          </label>
        </div>
      </div>

      <div className="card space-y-1">
        <p>Total Feed Cost: {fmt(summary.totalFeedCost)} ({fmtKg(summary.totalFeedKg)} kg)</p>
        <p>Total Sales: {fmt(summary.totalSales)}</p>
        <p>Total Cost: {fmt(summary.totalCost)}</p>
        <p className="font-semibold">Net Profit: {fmt(summary.netProfit)}</p>
        <p className="profit-per-head">
          Profit per Head: {summary.profitPerHead === null ? '—' : fmt(summary.profitPerHead)} / head
        </p>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Feed Costs</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left p-2 font-semibold text-slate-500">Feed</th>
              <th className="text-center p-2 font-semibold text-slate-500">Bags</th>
              <th className="text-center p-2 font-semibold text-slate-500">kg/bag</th>
              <th className="text-center p-2 font-semibold text-slate-500">Actual Price/bag (₱)</th>
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
                <td className="text-center p-2"><input type="number" value={f.pricePerBag} onChange={(e) => updateFeed(i, 'pricePerBag', e.target.value)} inputMode="decimal" min="0" step="0.01" className="input w-full" /></td>
                <td className="text-center p-2">{fmt(round2(f.bags * num(f.pricePerBag)))}</td>
                <td className="text-center p-2">{fmtKg(round2(f.bags * f.kgPerBag))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">Enter the current price for each feed type. Values are saved on this device.</p>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Sales Revenue</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left p-2 font-semibold text-slate-500">Description</th>
              <th className="text-center p-2 font-semibold text-slate-500">Weight (kg)</th>
              <th className="text-center p-2 font-semibold text-slate-500">Actual Price / kg (₱)</th>
              <th className="text-center p-2 font-semibold text-slate-500">Amount (₱)</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s, i) => (
              <tr key={s.id} className="border-b border-slate-200">
                <td className="p-2">{s.id}</td>
                <td className="text-center p-2"><input type="number" value={s.weightKg} onChange={(e) => updateSale(i, 'weightKg', num(e.target.value))} inputMode="decimal" min="0" step="any" className="input w-full" /></td>
                <td className="text-center p-2"><input type="number" value={s.pricePerKg} onChange={(e) => updateSale(i, 'pricePerKg', e.target.value)} inputMode="decimal" min="0" step="0.01" className="input w-full" /></td>
                <td className="text-center p-2">{fmt(round2(s.weightKg * num(s.pricePerKg)))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">Enter the actual selling price agreed with the buyer.</p>
      </div>

      <div className="card space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Cost Breakdown</h3>
        <div className="flex justify-between gap-3 text-sm"><span>Feed Cost</span><span>{fmt(summary.totalFeedCost)}</span></div>
        <div className="flex justify-between gap-3 text-sm"><span>Piglets ({heads} × {fmt(num(pigletPricePerHead))})</span><span>{fmt(summary.pigletCost)}</span></div>
        <div className="flex justify-between gap-3 text-sm"><span>Medication</span><span>{fmt(summary.medicationCost)}</span></div>
        <div className="flex justify-between gap-3 text-sm"><span>Electricity</span><span>{fmt(summary.electricityCost)}</span></div>
        <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 text-sm font-semibold"><span>Total Cost</span><span>{fmt(summary.totalCost)}</span></div>
        <div className="flex justify-between gap-3 text-sm"><span>Total Sales</span><span>{fmt(summary.totalSales)}</span></div>
        <div className="flex justify-between gap-3 text-sm font-bold"><span>Net Profit</span><span className={summary.netProfit < 0 ? "text-rose-700" : "text-emerald-700"}>{fmt(summary.netProfit)}</span></div>
        <div className="flex justify-between gap-3 text-sm font-semibold"><span>Profit per Head</span><span>{summary.profitPerHead === null ? '—' : fmt(summary.profitPerHead)}</span></div>
      </div>
    </div>
  );
}
