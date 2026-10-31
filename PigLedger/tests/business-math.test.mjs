import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaleBalances } from '../lib/business-math.mjs';

test('sales revenue is distinct from partial cash receipts and remaining balance', () => {
  const result = calculateSaleBalances([
    { id: 'sale-1', gross: 1000 },
    { id: 'sale-2', gross: 500 }
  ], [
    { saleId: 'sale-1', amount: 300 },
    { saleId: 'sale-1', amount: 200 },
    { saleId: 'sale-2', amount: 500 }
  ]);
  assert.equal(result.salesRevenue, 1500);
  assert.equal(result.cashReceived, 1000);
  assert.equal(result.outstanding, 500);
  assert.deepEqual(result.rows.map((row) => row.status), ['part-paid', 'paid']);
});

test('unpaid sales remain fully outstanding', () => {
  const result = calculateSaleBalances([{ id: 'sale-1', gross: 250 }], []);
  assert.equal(result.cashReceived, 0);
  assert.equal(result.outstanding, 250);
  assert.equal(result.rows[0].status, 'unpaid');
});

test('overpayments are identified instead of reducing outstanding below zero', () => {
  const result = calculateSaleBalances(
    [{ id: 'sale-1', gross: 100 }],
    [{ saleId: 'sale-1', amount: 120 }]
  );
  assert.equal(result.outstanding, 0);
  assert.equal(result.overpaidAmount, 20);
  assert.equal(result.rows[0].status, 'overpaid');
});

test('payments for unknown sales are excluded from the displayed settlement totals', () => {
  const result = calculateSaleBalances(
    [{ id: 'sale-1', gross: 100 }],
    [{ saleId: 'orphan', amount: 55 }]
  );
  assert.equal(result.cashReceived, 0);
  assert.equal(result.outstanding, 100);
});
