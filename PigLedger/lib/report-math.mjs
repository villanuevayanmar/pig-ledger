const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const money = (value) => Math.round((finite(value) + Number.EPSILON) * 100) / 100;

function inRange(date, from, to) {
  const value = String(date ?? '');
  return (!from || value >= from) && (!to || value <= to);
}

export function calculateReportFinancials({
  expenses = [],
  sales = [],
  payments = [],
  dateFrom = '',
  dateTo = ''
}) {
  const periodExpenses = expenses.filter((item) => inRange(item.date, dateFrom, dateTo));
  const periodSales = sales.filter((item) => inRange(item.date, dateFrom, dateTo));
  const scopedSaleIds = new Set(sales.map((sale) => String(sale.id)));
  const periodPayments = payments.filter((payment) =>
    scopedSaleIds.has(String(payment.saleId)) && inRange(payment.paymentDate, dateFrom, dateTo)
  );
  const salesBeforeEnd = sales.filter((sale) => !dateTo || String(sale.date) <= dateTo);
  const salesBeforeEndIds = new Set(salesBeforeEnd.map((sale) => String(sale.id)));
  const paymentsBeforeEnd = payments.filter((payment) =>
    salesBeforeEndIds.has(String(payment.saleId)) && (!dateTo || String(payment.paymentDate) <= dateTo)
  );
  const salesRevenue = money(periodSales.reduce((sum, item) => sum + finite(item.gross), 0));
  const totalCosts = money(periodExpenses.reduce((sum, item) => sum + finite(item.lineTotal), 0));
  const cashReceived = money(periodPayments.reduce((sum, item) => sum + finite(item.amount), 0));
  const receivables = money(Math.max(0,
    salesBeforeEnd.reduce((sum, item) => sum + finite(item.gross), 0) -
    paymentsBeforeEnd.reduce((sum, item) => sum + finite(item.amount), 0)
  ));
  return {
    periodExpenses,
    periodSales,
    periodPayments,
    salesRevenue,
    totalCosts,
    cashReceived,
    receivables,
    netProfit: money(salesRevenue - totalCosts)
  };
}

export function groupDailyCashflow(expenses = [], sales = [], dateFrom = '', dateTo = '') {
  const days = new Map();
  const add = (date, key, amount) => {
    const day = String(date ?? '');
    if (!day || !inRange(day, dateFrom, dateTo)) return;
    if (!days.has(day)) days.set(day, { date: day, revenue: 0, expenses: 0 });
    days.get(day)[key] = money(days.get(day)[key] + finite(amount));
  };
  for (const expense of expenses) add(expense.date, 'expenses', expense.lineTotal);
  for (const sale of sales) add(sale.date, 'revenue', sale.gross);
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
