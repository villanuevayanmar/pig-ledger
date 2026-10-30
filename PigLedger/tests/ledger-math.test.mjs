import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTotalsCore } from '../lib/ledger-math.mjs';

test('calculates expense, revenue, net, per-head and per-kg totals', () => {
  const result = computeTotalsCore(
    [
      { id: 'e1', category: 'Feed', qty: 2, price: 100, lineTotal: 200 },
      { id: 'e2', category: 'Medicine', qty: 1, price: 50, lineTotal: 50 }
    ],
    [
      { id: 's1', heads: 2, weightKg: 100, gross: 25000 },
      { id: 's2', heads: 1, weightKg: 50, gross: 12000 }
    ],
    5
  );

  assert.equal(result.totalExpenses, 250);
  assert.equal(result.totalWeight, 150);
  assert.equal(result.grossSales, 37000);
  assert.equal(result.totalHeads, 3);
  assert.equal(result.netIncome, 36750);
  assert.equal(result.profitPerPig, 7350);
  assert.equal(result.costPerPig, 50);
  assert.equal(result.costPerKg, 1.67);
  assert.deepEqual(result.categories, [
    { name: 'Feed', total: 200 },
    { name: 'Medicine', total: 50 }
  ]);
  assert.equal(result.issueCount, 0);
});

test('returns null per-head and per-kg measures when denominators are zero', () => {
  const result = computeTotalsCore(
    [{ id: 'e1', category: 'Other', qty: 1, price: 12, lineTotal: 12 }],
    [],
    0
  );

  assert.equal(result.netIncome, -12);
  assert.equal(result.profitPerPig, null);
  assert.equal(result.costPerPig, null);
  assert.equal(result.costPerKg, null);
  assert.equal(result.netBySale && Object.keys(result.netBySale).length, 0);
});

test('flags incorrect line totals and applies the existing no-weight expense allocation rule', () => {
  const result = computeTotalsCore(
    [{ id: 'e1', category: 'Feed', qty: 2, price: 10, lineTotal: 15 }],
    [{ id: 's1', heads: 1, weightKg: 0, gross: 8 }],
    1
  );

  assert.equal(result.discrepancies.e1, 20);
  assert.equal(result.issueCount, 1);
  assert.equal(result.netBySale.s1, -7);
});

test('rounds peso outputs to two decimals and tolerates numeric strings', () => {
  const result = computeTotalsCore(
    [{ id: 'e1', category: 'Feed', qty: '1', price: '0.105', lineTotal: '0.11' }],
    [{ id: 's1', heads: '1', weightKg: '3', gross: '10.105' }],
    '2'
  );

  assert.equal(result.totalExpenses, 0.11);
  assert.equal(result.grossSales, 10.11);
  assert.equal(result.netIncome, 10);
  assert.equal(result.profitPerPig, 5);
  assert.equal(result.issueCount, 0);
});
