import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePopulation, calculateFeedStock, calculateGrowthMetrics } from '../lib/farm-operations.mjs';

test('population counts purchases, mortality, transfers and sales once', () => {
  const result = calculatePopulation([
    { movementType: 'opening', heads: 20 },
    { movementType: 'purchase', heads: 5 },
    { movementType: 'mortality', heads: 2 },
    { movementType: 'transfer_out', heads: 1 }
  ], [{ heads: 3 }]);
  assert.equal(result.currentHeads, 19);
  assert.equal(result.sold, 3);
  assert.equal(result.hasOverdraw, false);
});

test('population flags events that exceed available animals', () => {
  const result = calculatePopulation([{ movementType: 'opening', heads: 2 }], [{ heads: 3 }]);
  assert.equal(result.currentHeads, -1);
  assert.equal(result.hasOverdraw, true);
});

test('feed purchases are not confused with actual consumption', () => {
  const result = calculateFeedStock([
    { movementType: 'purchase', quantityUnits: 10, kgPerUnitSnapshot: 25 },
    { movementType: 'waste', quantityUnits: 1, kgPerUnitSnapshot: 25 }
  ], [{ quantityUnits: 4, kgPerUnitSnapshot: 25 }]);
  assert.equal(result.purchasedKg, 250);
  assert.equal(result.consumedKg, 100);
  assert.equal(result.stockKg, 125);
  assert.equal(result.hasNegativeStock, false);
  assert.equal(result.products[0].stockKg, 125);
});

test('feed stock warns when consumption exceeds recorded inventory', () => {
  const result = calculateFeedStock([], [{ quantityUnits: 2, kgPerUnitSnapshot: 25 }]);
  assert.equal(result.stockKg, -50);
  assert.equal(result.hasNegativeStock, true);
});

test('growth metrics calculate ADG and FCR only when valid source data exists', () => {
  assert.deepEqual(calculateGrowthMetrics({
    startWeightKg: 20, endWeightKg: 80, days: 60, consumedFeedKg: 150
  }), { gainKg: 60, averageDailyGainKg: 1, fcr: 2.5 });
  assert.equal(calculateGrowthMetrics({
    startWeightKg: 80, endWeightKg: 80, days: 0, consumedFeedKg: 100
  }).fcr, null);
});

test('population counts are whole animals and invalid movement types are ignored', () => {
  const result = calculatePopulation([
    { movementType: 'opening', heads: 4.9 },
    { movementType: 'unknown', heads: 100 }
  ], [{ heads: 1.8 }]);
  assert.equal(result.currentHeads, 3);
});

test('feed stock warnings are tracked per product, not hidden by another product', () => {
  const result = calculateFeedStock([
    { productId: 'starter', movementType: 'purchase', quantityUnits: 1, kgPerUnitSnapshot: 25 },
    { productId: 'grower', movementType: 'purchase', quantityUnits: 1, kgPerUnitSnapshot: 25 }
  ], [
    { productId: 'starter', quantityUnits: 2, kgPerUnitSnapshot: 25 }
  ]);
  assert.equal(result.stockKg, 0);
  assert.equal(result.hasNegativeStock, true);
  assert.equal(result.products.find((item) => item.productId === 'starter').stockKg, -25);
  assert.equal(result.products.find((item) => item.productId === 'grower').stockKg, 25);
});
