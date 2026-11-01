const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const nonNegative = (value) => Math.max(0, finite(value));
const money = (value) => Math.round((finite(value) + Number.EPSILON) * 100) / 100;

export function calculateSaleBalances(sales = [], payments = []) {
  const paymentTotals = new Map();
  for (const payment of payments) {
    const key = String(payment.saleId ?? '');
    if (!key) continue;
    paymentTotals.set(key, money((paymentTotals.get(key) ?? 0) + nonNegative(payment.amount)));
  }

  const rows = sales.map((sale) => {
    const saleId = String(sale.id ?? '');
    const gross = money(nonNegative(sale.gross));
    const paid = money(paymentTotals.get(saleId) ?? 0);
    const rawBalance = money(gross - paid);
    const status = rawBalance < -0.009 ? 'overpaid' : rawBalance <= 0.009 ? 'paid' : paid > 0 ? 'part-paid' : 'unpaid';
    return {
      saleId,
      gross,
      paid,
      balance: money(Math.max(0, rawBalance)),
      overpaid: rawBalance < -0.009,
      status
    };
  });

  return {
    rows,
    salesRevenue: money(rows.reduce((sum, row) => sum + row.gross, 0)),
    cashReceived: money(rows.reduce((sum, row) => sum + row.paid, 0)),
    outstanding: money(rows.reduce((sum, row) => sum + row.balance, 0)),
    overpaidAmount: money(rows.reduce((sum, row) => sum + Math.max(0, -money(row.gross - row.paid)), 0))
  };
}
