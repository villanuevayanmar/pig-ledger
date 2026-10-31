export const CATEGORIES = [
  'Booster',
  'Pre-Starter',
  'Starter',
  'Grower',
  'Finisher',
  'Gestating',
  'Lactating',
  'Vitamins / Medicine',
  'Payment for technicians',
  'Other Feed',
  'Miscellaneous',
  'Other'
] as const;

export const UNITS = ['Sack', 'Kg', 'Head', 'Liter', 'Pack', 'Piece'] as const;
export const FEED_CATEGORIES = ['Booster', 'Pre-Starter', 'Starter', 'Grower', 'Finisher', 'Gestating', 'Lactating', 'Other Feed'] as const;

export type BatchStatus = 'active' | 'completed' | 'archived';

export type BatchProjection = {
  plannedHeads: number;
  expectedAvgSaleWeightKg: number;
  expectedPricePerKg: number;
  pigletPricePerHead: number;
  projectedFeedCost: number;
  projectedOtherCosts: number;
};

export type Batch = {
  id: string;
  farmId: string;
  name: string;
  startDate: string;
  targetSaleDate?: string | null;
  initialHeads: number;
  status: BatchStatus;
  projection: BatchProjection;
  createdAt: string;
};

export type FatteningFeed = {
  name: string;
  bags: number;
  kgPerBag: number;
  pricePerBag: number;
};

export type FatteningSale = {
  weightKg: number;
  pricePerKg: number;
  gross: number;
};

export type FatteningSummary = {
  totalFeedCost: number;
  totalFeedKg: number;
  totalSales: number;
  totalCost: number;
  netProfit: number;
  profitPerHead: number | null;
};

export type Expense = {
  id: string;
  date: string;
  category: string;
  description: string;
  qty: number;
  unit: string;
  price: number;
  lineTotal: number;
  batchId?: string | null;
  expenseType?: string;
  itemName?: string;
  kgPerUnit?: number;
};

export type Sale = {
  id: string;
  date: string;
  buyer: string;
  heads: number;
  weightKg: number;
  pricePerKg: number;
  gross: number;
  batchId?: string | null;
};

export type Farm = {
  id: string;
  name: string;
  pigCount: number;
  startDate: string;
};

export type CategoryTotal = { name: string; total: number };

export type Totals = {
  totalExpenses: number;
  totalWeight: number;
  grossSales: number;
  totalHeads: number;
  netIncome: number;
  profitPerPig: number | null;
  costPerPig: number | null;
  costPerKg: number | null;
  categories: CategoryTotal[];
  discrepancies: Record<string, number>;
  netBySale: Record<string, number>;
  issueCount: number;
};

export type PopulationMovementType =
  | 'opening' | 'purchase' | 'mortality' | 'transfer_in' | 'transfer_out'
  | 'adjustment_in' | 'adjustment_out';

export type PopulationMovement = {
  id: string;
  farmId: string;
  batchId: string;
  movementDate: string;
  movementType: PopulationMovementType;
  heads: number;
  notes: string;
};

export type FeedProduct = {
  id: string;
  farmId: string;
  name: string;
  category: string;
  unit: string;
  kgPerUnit: number;
  isActive: boolean;
  createdAt: string;
};

export type FeedInventoryMovementType = 'purchase' | 'adjustment_in' | 'adjustment_out' | 'waste';

export type FeedInventoryMovement = {
  id: string;
  farmId: string;
  productId: string;
  movementDate: string;
  movementType: FeedInventoryMovementType;
  quantityUnits: number;
  kgPerUnitSnapshot: number;
  unitCost: number;
  notes: string;
};

export type FeedConsumptionRecord = {
  id: string;
  farmId: string;
  batchId: string;
  productId: string;
  consumptionDate: string;
  quantityUnits: number;
  kgPerUnitSnapshot: number;
  notes: string;
};

export type WeightRecord = {
  id: string;
  farmId: string;
  batchId: string;
  measuredOn: string;
  headCount: number;
  averageWeightKg: number;
  notes: string;
};

export type HealthRecordType =
  | 'observation' | 'illness' | 'treatment' | 'vaccination'
  | 'deworming' | 'medication' | 'recovery';

export type HealthRecord = {
  id: string;
  farmId: string;
  batchId: string;
  recordDate: string;
  recordType: HealthRecordType;
  title: string;
  symptoms: string;
  medicine: string;
  dosage: string;
  treatedHeads: number;
  cost: number;
  expenseId?: string | null;
  nextDueDate?: string | null;
  notes: string;
};
