const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const nonNegative = (value) => Math.max(0, finite(value));

export function calculatePopulation(movements = [], sales = []) {
  const totals = {
    opening: 0, purchase: 0, transferIn: 0, transferOut: 0,
    mortality: 0, adjustmentIn: 0, adjustmentOut: 0, sold: 0
  };
  for (const item of movements) {
    const heads = nonNegative(item.heads);
    switch (item.movementType) {
      case 'opening': totals.opening += heads; break;
      case 'purchase': totals.purchase += heads; break;
      case 'transfer_in': totals.transferIn += heads; break;
      case 'transfer_out': totals.transferOut += heads; break;
      case 'mortality': totals.mortality += heads; break;
      case 'adjustment_in': totals.adjustmentIn += heads; break;
      case 'adjustment_out': totals.adjustmentOut += heads; break;
      default: break;
    }
  }
  totals.sold = sales.reduce((sum, sale) => sum + nonNegative(sale.heads), 0);
  const currentHeads = totals.opening + totals.purchase + totals.transferIn +
    totals.adjustmentIn - totals.transferOut - totals.mortality -
    totals.adjustmentOut - totals.sold;
  return { ...totals, currentHeads: Math.max(0, currentHeads), hasOverdraw: currentHeads < 0 };
}

export function calculateFeedStock(inventoryMovements = [], consumption = []) {
  let stockKg = 0;
  let purchasedKg = 0;
  let consumedKg = 0;
  for (const movement of inventoryMovements) {
    const kg = nonNegative(movement.quantityUnits) * nonNegative(movement.kgPerUnitSnapshot);
    if (movement.movementType === 'purchase') purchasedKg += kg;
    if (movement.movementType === 'purchase' || movement.movementType === 'adjustment_in') stockKg += kg;
    if (movement.movementType === 'adjustment_out' || movement.movementType === 'waste') stockKg -= kg;
  }
  for (const item of consumption) {
    const kg = nonNegative(item.quantityUnits) * nonNegative(item.kgPerUnitSnapshot);
    consumedKg += kg;
    stockKg -= kg;
  }
  return {
    purchasedKg: round2(purchasedKg),
    consumedKg: round2(consumedKg),
    stockKg: round2(stockKg),
    hasNegativeStock: stockKg < -0.000001
  };
}

export function calculateGrowthMetrics({ startWeightKg, endWeightKg, days, consumedFeedKg }) {
  const start = nonNegative(startWeightKg);
  const end = nonNegative(endWeightKg);
  const duration = nonNegative(days);
  const feed = nonNegative(consumedFeedKg);
  const gainKg = end - start;
  const averageDailyGainKg = duration > 0 && gainKg >= 0 ? round4(gainKg / duration) : null;
  const fcr = gainKg > 0 && feed > 0 ? round4(feed / gainKg) : null;
  return { gainKg: round2(gainKg), averageDailyGainKg, fcr };
}

function round2(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function round4(value) { return Math.round((value + Number.EPSILON) * 10000) / 10000; }
