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
  assert.equal(result.currentHeads, 0);
  assert.equal(result.hasOverdraw, true);
});

test('feed purchases are not confused with actual consumption', () => {
  const result = calculateFeedStock([
    { movementType: 'purchase', quantityUnits: 10, kgPerUnitSnapshot: 25 },
    { movementType: 'waste', quantityUnits: 1, kgPerUnitSnapshot: 25 }
  ], [{ quantityUnits: 4, kgPerUnitSnapshot: 25 }]);
  assert.deepEqual(result, { purchasedKg: 250, consumedKg: 100, stockKg: 125, hasNegativeStock: false });
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
