function num(value) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value) {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Pure financial summary calculation shared by the application and node:test.
 * Purchases/expenses and sale revenue are used exactly as recorded; this
 * function does not infer inventory consumption or cash payments.
 */
export function computeTotalsCore(expenses, sales, pigCount) {
  const totalExpenses = round2(expenses.reduce((sum, expense) => sum + num(expense.lineTotal), 0));
  const totalWeight = round2(sales.reduce((sum, sale) => sum + num(sale.weightKg), 0));
  const grossSales = round2(sales.reduce((sum, sale) => sum + num(sale.gross), 0));
  const totalHeads = sales.reduce((sum, sale) => sum + num(sale.heads), 0);
  const netIncome = round2(grossSales - totalExpenses);

  const pigs = Math.max(0, Math.floor(num(pigCount)));
  const profitPerPig = pigs > 0 ? round2(netIncome / pigs) : null;
  const costPerPig = pigs > 0 ? round2(totalExpenses / pigs) : null;
  const costPerKg = totalWeight > 0 ? round2(totalExpenses / totalWeight) : null;

  const byCategory = new Map();
  for (const expense of expenses) {
    const category = String(expense.category ?? 'Other');
    byCategory.set(category, round2((byCategory.get(category) ?? 0) + num(expense.lineTotal)));
  }
  const categories = [...byCategory.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const discrepancies = {};
  for (const expense of expenses) {
    const expected = round2(num(expense.qty) * num(expense.price));
    if (Math.abs(expected - num(expense.lineTotal)) > 0.01) {
      discrepancies[expense.id] = expected;
    }
  }

  const netBySale = {};
  for (const sale of sales) {
    const share = totalWeight > 0
      ? round2(totalExpenses * (num(sale.weightKg) / totalWeight))
      : totalExpenses;
    netBySale[sale.id] = round2(num(sale.gross) - share);
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
