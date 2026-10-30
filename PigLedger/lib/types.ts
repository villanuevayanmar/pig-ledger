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
