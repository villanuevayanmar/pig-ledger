import type { Expense, Totals } from './types.js';
import type { Sale } from './types.js';

export function computeTotalsCore(expenses: Expense[], sales: Sale[], pigCount: number): Totals;
