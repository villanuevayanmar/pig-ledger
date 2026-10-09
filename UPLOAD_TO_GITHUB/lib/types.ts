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

export type Expense = {
  id: string;
  date: string;
  category: string;
  description: string;
  qty: number;
  unit: string;
  price: number;
  lineTotal: number;
};

export type Sale = {
  id: string;
  date: string;
  buyer: string;
  heads: number;
  weightKg: number;
  pricePerKg: number;
  gross: number;
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
  /** expense id -> expected line total (qty x price) when they don't match */
  discrepancies: Record<string, number>;
  /** sale id -> net revenue after its share of expenses */
  netBySale: Record<string, number>;
  issueCount: number;
};
