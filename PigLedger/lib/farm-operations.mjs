const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const nonNegative = (value) => Math.max(0, finite(value));
const wholeHeads = (value) => Math.floor(nonNegative(value));

export function calculatePopulation(movements = [], sales = []) {
  const totals = {
    opening: 0, purchase: 0, transferIn: 0, transferOut: 0,
    mortality: 0, adjustmentIn: 0, adjustmentOut: 0, sold: 0
  };
  for (const item of movements) {
    const heads = wholeHeads(item.heads);
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
  totals.sold = sales.reduce((sum, sale) => sum + wholeHeads(sale.heads), 0);
  const currentHeads = totals.opening + totals.purchase + totals.transferIn +
    totals.adjustmentIn - totals.transferOut - totals.mortality -
    totals.adjustmentOut - totals.sold;
  return { ...totals, currentHeads, hasOverdraw: currentHeads < 0 };
}

export function calculateFeedStock(inventoryMovements = [], consumption = []) {
  const products = new Map();
  const getProduct = (id) => {
    const key = String(id ?? 'default');
    if (!products.has(key)) products.set(key, { productId: key, purchasedKg: 0, consumedKg: 0, stockKg: 0 });
    return products.get(key);
  };
  for (const movement of inventoryMovements) {
    const product = getProduct(movement.productId);
    const kg = nonNegative(movement.quantityUnits) * nonNegative(movement.kgPerUnitSnapshot);
    if (movement.movementType === 'purchase') product.purchasedKg += kg;
    if (movement.movementType === 'purchase' || movement.movementType === 'adjustment_in') product.stockKg += kg;
    if (movement.movementType === 'adjustment_out' || movement.movementType === 'waste') product.stockKg -= kg;
  }
  for (const item of consumption) {
    const product = getProduct(item.productId);
    const kg = nonNegative(item.quantityUnits) * nonNegative(item.kgPerUnitSnapshot);
    product.consumedKg += kg;
    product.stockKg -= kg;
  }
  const productTotals = [...products.values()].map((item) => ({
    productId: item.productId,
    purchasedKg: round2(item.purchasedKg),
    consumedKg: round2(item.consumedKg),
    stockKg: round2(item.stockKg),
    hasNegativeStock: item.stockKg < -0.000001
  }));
  return {
    purchasedKg: round2(productTotals.reduce((sum, item) => sum + item.purchasedKg, 0)),
    consumedKg: round2(productTotals.reduce((sum, item) => sum + item.consumedKg, 0)),
    stockKg: round2(productTotals.reduce((sum, item) => sum + item.stockKg, 0)),
    hasNegativeStock: productTotals.some((item) => item.hasNegativeStock),
    products: productTotals
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

export function calculateBatchGrowthMetrics({
  startAverageWeightKg, endAverageWeightKg, startHeadCount, endHeadCount,
  days, consumedFeedKg, populationChanged = false
}) {
  const startWeight = nonNegative(startAverageWeightKg);
  const endWeight = nonNegative(endAverageWeightKg);
  const startHeads = wholeHeads(startHeadCount);
  const endHeads = wholeHeads(endHeadCount);
  const duration = nonNegative(days);
  const feedKg = nonNegative(consumedFeedKg);
  const gainPerHeadKg = endWeight - startWeight;
  const averageDailyGainKg = duration > 0 && gainPerHeadKg >= 0
    ? round4(gainPerHeadKg / duration)
    : null;
  const comparablePopulation = !populationChanged && startHeads > 0 && startHeads === endHeads;
  const totalGainKg = comparablePopulation && gainPerHeadKg > 0
    ? round2(gainPerHeadKg * startHeads)
    : null;
  const fcr = totalGainKg !== null && feedKg > 0 ? round4(feedKg / totalGainKg) : null;
  return {
    gainPerHeadKg: round2(gainPerHeadKg),
    averageDailyGainKg,
    totalGainKg,
    fcr,
    fcrEligible: comparablePopulation && gainPerHeadKg > 0 && feedKg > 0
  };
}
