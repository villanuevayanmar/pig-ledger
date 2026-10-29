import { round2 } from './format';
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

  // Expenses grouped by category (keep the standard order, skip empties)
  const byCat = new Map<string, number>();
  for (const e of expenses) {
    byCat.set(e.category, round2((byCat.get(e.category) ?? 0) + e.lineTotal));
  }
  const categories: CategoryTotal[] = [...byCat.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  // Discrepancies: entered line total does not equal qty x price
  const discrepancies: Record<string, number> = {};
  for (const e of expenses) {
    const expected = round2(e.qty * e.price);
    if (Math.abs(expected - e.lineTotal) > 0.01) {
      discrepancies[e.id] = expected;
    }
  }

  // Net revenue per sale: gross minus this sale's share of expenses
  // (share = its weight / total weight sold)
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

/** Compute the fattening sheet summary from feeds + sales + head count. */
export function computeFattening(
  feeds: { name: string; bags: number; kgPerBag: number; pricePerBag: number }[],
  sales: { weightKg: number; pricePerKg: number }[],
  heads: number
): {
  totalFeedCost: number;
  totalFeedKg: number;
  totalSales: number;
  totalCost: number;
  netProfit: number;
  profitPerHead: number | null;
} {
  // --- Feed breakdown ---
  let totalFeedCost = 0;
  let totalFeedKg = 0;
  for (const f of feeds) {
    const bags = num(f.bags);
    const kgPerBag = num(f.kgPerBag);
    const pricePerBag = num(f.pricePerBag);
    const amount = round2(bags * pricePerBag);
    const kg = round2(bags * kgPerBag);
    totalFeedCost += amount;
    totalFeedKg += kg;
  }

  // --- Sales ---
  let totalSales = 0;
  for (const s of sales) {
    const weightKg = num(s.weightKg);
    const pricePerKg = num(s.pricePerKg);
    totalSales += round2(weightKg * pricePerKg);
  }

  // --- Costs ---
  const pigletCost = round2(num(heads) * 4000);      // ₱4,000 per head
  const medication = 3600;
  const electricity = 3000;
  const totalCost = round2(totalFeedCost + pigletCost + medication + electricity);

  // --- Profit ---
  const netProfit = round2(totalSales - totalCost);
  const profitPerHead = num(heads) > 0 ? round2(netProfit / num(heads)) : null;

  return { totalFeedCost, totalFeedKg, totalSales, totalCost, netProfit, profitPerHead };
}
