import type { Expense, Sale, Totals } from './types';

export function computeTotalsCore(expenses: Expense[], sales: Sale[], pigCount: number): Totals;
