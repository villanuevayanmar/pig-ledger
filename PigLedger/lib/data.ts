import type { SupabaseClient } from '@supabase/supabase-js';
import { num, round2 } from './format';
import { computeTotals } from './totals';
import type { Expense, Farm, Sale } from './types';

/* ---------- Row mapping (snake_case DB -> camelCase app) ---------- */

type ExpenseRow = {
  id: string;
  date: string;
  category: string;
  description: string;
  qty: number;
  unit: string;
  price: number;
  line_total: number;
};

type SaleRow = {
  id: string;
  date: string;
  buyer: string;
  heads: number;
  weight_kg: number;
  price_per_kg: number;
  gross: number;
};

type FarmRow = {
  id: string;
  name: string;
  pig_count: number;
  start_date: string;
};

export function mapExpense(r: ExpenseRow): Expense {
  return {
    id: r.id,
    date: r.date,
    category: r.category,
    description: r.description || '',
    qty: num(r.qty),
    unit: r.unit || 'Sack',
    price: num(r.price),
    lineTotal: num(r.line_total)
  };
}

export function mapSale(r: SaleRow): Sale {
  return {
    id: r.id,
    date: r.date,
    buyer: r.buyer || '',
    heads: Math.round(num(r.heads)),
    weightKg: num(r.weight_kg),
    pricePerKg: num(r.price_per_kg),
    gross: num(r.gross)
  };
}

export function mapFarm(r: FarmRow): Farm {
  return {
    id: r.id,
    name: r.name || 'My Piggery',
    pigCount: Math.round(num(r.pig_count)),
    startDate: r.start_date || ''
  };
}

/* ---------- Reads ---------- */

/** Return the first farm row, creating one if the table is empty. */
export async function ensureFarm(sb: SupabaseClient): Promise<Farm> {
  const { data: rows, error } = await sb
    .from('farms')
    .select('id, name, pig_count, start_date')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) throw new Error('Could not load farm: ' + error.message);
  if (rows && rows.length > 0) return mapFarm(rows[0] as FarmRow);

  const { data: created, error: insertError } = await sb
    .from('farms')
    .insert({ name: 'My Piggery', pig_count: 0 })
    .select('id, name, pig_count, start_date')
    .single();

  if (insertError) throw new Error('Could not create farm: ' + insertError.message);
  return mapFarm(created as FarmRow);
}

export async function getExpenses(sb: SupabaseClient, farmId: string): Promise<Expense[]> {
  const { data, error } = await sb
    .from('expenses')
    .select('id, date, category, description, qty, unit, price, line_total')
    .eq('farm_id', farmId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error('Could not load expenses: ' + error.message);
  return ((data ?? []) as ExpenseRow[]).map(mapExpense);
}

export async function getSales(sb: SupabaseClient, farmId: string): Promise<Sale[]> {
  const { data, error } = await sb
    .from('sales')
    .select('id, date, buyer, heads, weight_kg, price_per_kg, gross')
    .eq('farm_id', farmId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error('Could not load sales: ' + error.message);
  return ((data ?? []) as SaleRow[]).map(mapSale);
}

/** Convenience: farm + expenses + sales + totals in one call. */
export async function loadLedger(sb: SupabaseClient) {
  const farm = await ensureFarm(sb);
  const [expenses, sales] = await Promise.all([
    getExpenses(sb, farm.id),
    getSales(sb, farm.id)
  ]);
  const totals = computeTotals(expenses, sales, farm.pigCount);
  return { farm, expenses, sales, totals };
}

export { round2 };
