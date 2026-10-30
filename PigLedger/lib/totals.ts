import { num, round2 } from './format';
import type { Expense, Sale, Totals } from './types';
import { computeTotalsCore } from './ledger-math.mjs';

export function computeTotals(expenses: Expense[], sales: Sale[], pigCount: number): Totals {
  return computeTotalsCore(expenses, sales, pigCount);
}

export function computeFattening(
  feeds: { name: string; bags: number; kgPerBag: number; pricePerBag: number | string }[],
  sales: { weightKg: number; pricePerKg: number | string }[],
  heads: number,
  pigletPricePerHead = 0,
  medication = 0,
  electricity = 0
): {
  totalFeedCost: number;
  totalFeedKg: number;
  totalSales: number;
  pigletCost: number;
  medicationCost: number;
  electricityCost: number;
  totalCost: number;
  netProfit: number;
  profitPerHead: number | null;
} {
  let totalFeedCost = 0;
  let totalFeedKg = 0;
  for (const f of feeds) {
    const bags = num(f.bags);
    const kgPerBag = num(f.kgPerBag);
    const pricePerBag = num(f.pricePerBag);
    totalFeedCost += round2(bags * pricePerBag);
    totalFeedKg += round2(bags * kgPerBag);
  }

  let totalSales = 0;
  for (const s of sales) {
    totalSales += round2(num(s.weightKg) * num(s.pricePerKg));
  }

  const pigletCost = round2(num(heads) * num(pigletPricePerHead));
  const medicationCost = round2(num(medication));
  const electricityCost = round2(num(electricity));
  const totalCost = round2(totalFeedCost + pigletCost + medicationCost + electricityCost);
  const netProfit = round2(totalSales - totalCost);
  const profitPerHead = num(heads) > 0 ? round2(netProfit / num(heads)) : null;

  return {
    totalFeedCost: round2(totalFeedCost),
    totalFeedKg: round2(totalFeedKg),
    totalSales: round2(totalSales),
    pigletCost,
    medicationCost,
    electricityCost,
    totalCost,
    netProfit,
    profitPerHead
  };
}
