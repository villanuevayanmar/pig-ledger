export type PopulationMovement = { movementType: string; heads: number };
export type PopulationSale = { heads: number };
export function calculatePopulation(movements?: PopulationMovement[], sales?: PopulationSale[]): {
  opening: number; purchase: number; transferIn: number; transferOut: number;
  mortality: number; adjustmentIn: number; adjustmentOut: number;
  sold: number; currentHeads: number; hasOverdraw: boolean;
};
export type FeedMovement = {
  movementType: 'purchase' | 'adjustment_in' | 'adjustment_out' | 'waste';
  quantityUnits: number; kgPerUnitSnapshot: number;
};
export type FeedConsumption = { quantityUnits: number; kgPerUnitSnapshot: number };
export function calculateFeedStock(inventoryMovements?: FeedMovement[], consumption?: FeedConsumption[]): {
  purchasedKg: number; consumedKg: number; stockKg: number; hasNegativeStock: boolean;
};
export function calculateGrowthMetrics(input: {
  startWeightKg: number; endWeightKg: number; days: number; consumedFeedKg: number;
}): { gainKg: number; averageDailyGainKg: number | null; fcr: number | null };
