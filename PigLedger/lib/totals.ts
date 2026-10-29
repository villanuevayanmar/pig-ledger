import { num, round2 } from './format';
import type { CategoryTotal, Expense, Sale, Totals } from './types';

export function computeTotals(expenses: Expense[], sales: Sale[], pigCount: number): Totals {
  const totalExpenses = round2(expenses.reduce((sum, e) => sum + e.lineTotal, 0));
  const totalWeight = round2(sales.reduce((sum, s) => sum + s.weightKg, 0));
  const grossSales = round2(sales.reduce((sum, s) => sum + s.gross, 0));
  const totalHeads = sales.reduce((sum, s) => sum + s.heads, 0);
  const netIncome = round2(grossSales - totalExpenses);

  const pigs = Math.max(0, Math.floor(pigCount));
  const profitPerPig = pigs > 0 ? round2(netIncome / pigs) : null;
  const costPerPig = pigs > 0 ? round2(totalExpenses / pigs) : null;
  const costPerKg = totalWeight > 0 ? round2(totalExpenses / totalWeight) : null;

  const byCat = new Map<string, number>();
  for (const e of expenses) {
    byCat.set(e.category, round2((byCat.get(e.category) ?? 0) + e.lineTotal));
  }
  const categories: CategoryTotal[] = [...byCat.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const discrepancies: Record<string, number> = {};
  for (const e of expenses) {
    const expected = round2(e.qty * e.price);
    if (Math.abs(expected - e.lineTotal) > 0.01) {
      discrepancies[e.id] = expected;
    }
  }

  const netBySale: Record<string, number> = {};
  for (const s of sales) {
    const share =
      totalWeight > 0 ? round2(totalExpenses * (s.weightKg / totalWeight)) : totalExpenses;
    netBySale[s.id] = round2(s.gross - share);
  }

  return {
    totalExpenses,
    totalWeight,
    grossSales,
    totalHeads,
    netIncome,
    profitPerPig,
    costPerPig,
    costPerKg,
    categories,
    discrepancies,
    netBySale,
    issueCount: Object.keys(discrepancies).length
  };
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
