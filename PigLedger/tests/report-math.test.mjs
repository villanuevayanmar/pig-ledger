import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReportFinancials, groupDailyCashflow } from '../lib/report-math.mjs';

test('report separates sales revenue, cash received in period and outstanding balance', () => {
  const result = calculateReportFinancials({
    expenses: [
      { date: '2026-10-01', lineTotal: 100 },
      { date: '2026-10-03', lineTotal: 50 }
    ],
    sales: [
      { id: 's1', date: '2026-09-20', gross: 300 },
      { id: 's2', date: '2026-10-02', gross: 500 }
    ],
    payments: [
      { saleId: 's1', paymentDate: '2026-10-02', amount: 100 },
      { saleId: 's2', paymentDate: '2026-10-03', amount: 200 },
      { saleId: 's2', paymentDate: '2026-10-04', amount: 100 }
    ],
    dateFrom: '2026-10-01',
    dateTo: '2026-10-03'
  });
  assert.equal(result.salesRevenue, 500);
  assert.equal(result.totalCosts, 150);
  assert.equal(result.cashReceived, 300);
  assert.equal(result.receivables, 400);
  assert.equal(result.netProfit, 350);
});

test('payment period includes receipts for older scoped sales but outstanding excludes payments after report end', () => {
  const result = calculateReportFinancials({
    expenses: [],
    sales: [{ id: 'old-sale', date: '2026-09-01', gross: 1000 }],
    payments: [
      { saleId: 'old-sale', paymentDate: '2026-10-02', amount: 200 },
      { saleId: 'old-sale', paymentDate: '2026-10-05', amount: 300 }
    ],
    dateFrom: '2026-10-01',
    dateTo: '2026-10-03'
  });
  assert.equal(result.salesRevenue, 0);
  assert.equal(result.cashReceived, 200);
  assert.equal(result.receivables, 800);
});

test('payments unrelated to the selected batch are excluded', () => {
  const result = calculateReportFinancials({
    sales: [{ id: 's1', date: '2026-10-01', gross: 100 }],
    payments: [{ saleId: 'other-sale', paymentDate: '2026-10-02', amount: 999 }],
    dateFrom: '',
    dateTo: ''
  });
  assert.equal(result.cashReceived, 0);
  assert.equal(result.receivables, 100);
});

test('daily cashflow groups revenue and costs on transaction dates', () => {
  assert.deepEqual(groupDailyCashflow(
    [{ date: '2026-10-01', lineTotal: 10 }, { date: '2026-10-02', lineTotal: 30 }],
    [{ id: 's1', date: '2026-10-01', gross: 100 }]
  ), [
    { date: '2026-10-01', revenue: 100, expenses: 10 },
    { date: '2026-10-02', revenue: 0, expenses: 30 }
  ]);
});
