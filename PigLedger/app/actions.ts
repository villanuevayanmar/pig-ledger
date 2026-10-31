'use server';

import { revalidatePath } from 'next/cache';
import { ensureFarm, requireUser } from '@/lib/data';
import { num, round2, today } from '@/lib/format';
import { createClient, supabaseConfigured } from '@/lib/supabase/server';
import type { Expense, Sale } from '@/lib/types';

function refreshAll() {
  revalidatePath('/', 'layout');
}

function str(v: FormDataEntryValue | null, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

/* ---------- Expenses ---------- */

export async function addExpense(formData: FormData): Promise<void> {
  if (!supabaseConfigured) return;
  const sb = createClient();
  const user = await requireUser(sb);
  const farm = await ensureFarm(sb);

  const qty = num(str(formData.get('qty')));
  const price = num(str(formData.get('price')));

  const { error } = await sb.from('expenses').insert({
    farm_id: farm.id,
    user_id: user.id,
    date: str(formData.get('date')) || today(),
    category: str(formData.get('category'), 'Booster'),
    description: str(formData.get('description')),
    qty,
    unit: str(formData.get('unit'), 'Sack'),
    price,
    line_total: round2(qty * price)
  });
  if (error) throw new Error('Could not save expense: ' + error.message);
  refreshAll();
}

export async function deleteExpense(id: string): Promise<void> {
  if (!supabaseConfigured) return;
  const sb = createClient();
  const user = await requireUser(sb);
  const { error } = await sb.from('expenses').delete().eq('id', id).eq('user_id', user.id);
  if (error) throw new Error('Could not delete expense: ' + error.message);
  refreshAll();
}

/* ---------- Sales ---------- */

export async function addSale(formData: FormData): Promise<void> {
  if (!supabaseConfigured) return;
  const sb = createClient();
  const user = await requireUser(sb);
  const farm = await ensureFarm(sb);

  const weightKg = num(str(formData.get('weightKg')));
  const pricePerKg = num(str(formData.get('pricePerKg')));

  const { error } = await sb.from('sales').insert({
    farm_id: farm.id,
    user_id: user.id,
    date: str(formData.get('date')) || today(),
    buyer: str(formData.get('buyer')),
    heads: Math.round(num(str(formData.get('heads')))),
    weight_kg: weightKg,
    price_per_kg: pricePerKg,
    gross: round2(weightKg * pricePerKg)
  });
  if (error) throw new Error('Could not save sale: ' + error.message);
  refreshAll();
}

export async function deleteSale(id: string): Promise<void> {
  if (!supabaseConfigured) return;
  const sb = createClient();
  const user = await requireUser(sb);
  const { error } = await sb.from('sales').delete().eq('id', id).eq('user_id', user.id);
  if (error) throw new Error('Could not delete sale: ' + error.message);
  refreshAll();
}

/* ---------- Farm setup ---------- */

export async function updateFarm(formData: FormData): Promise<void> {
  if (!supabaseConfigured) return;
  const sb = createClient();
  const user = await requireUser(sb);
  const farm = await ensureFarm(sb);

  const { error } = await sb
    .from('farms')
    .update({
      name: str(formData.get('name'), 'My Piggery'),
      pig_count: Math.round(num(str(formData.get('pigCount'))))
    })
    .eq('id', farm.id)
    .eq('user_id', user.id);
  if (error) throw new Error('Could not update farm: ' + error.message);
  refreshAll();
}

/* ---------- Backup restore / clear ---------- */

type BackupPayload = {
  app?: string;
  version?: number;
  farm?: { name?: string; pigCount?: number };
  expenses?: Partial<Expense>[];
  sales?: Partial<Sale>[];
};

function validNonNegative(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validDate(value: unknown): boolean {
  return typeof value === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

async function backupId(sourceId: unknown, table: 'expenses' | 'sales', index: number): Promise<string> {
  const raw = typeof sourceId === 'string' ? sourceId : '';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) return raw;
  const input = new TextEncoder().encode(`pig-ledger:${raw || `${table}:${index}`}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', input)).slice(0, 16);
  const hex = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function importAll(payloadJson: string): Promise<{ ok: boolean; message: string }> {
  if (!supabaseConfigured) return { ok: false, message: 'Supabase is not connected yet.' };

  let payload: BackupPayload;
  try {
    payload = JSON.parse(payloadJson) as BackupPayload;
  } catch {
    return { ok: false, message: 'This file is not valid JSON.' };
  }

  if (!payload || typeof payload !== 'object' || payload.app !== 'Pig Farm Ledger' ||
      payload.version !== 1 || !Array.isArray(payload.expenses) || !Array.isArray(payload.sales)) {
    return { ok: false, message: 'Unsupported backup. Choose a version 1 Pig Farm Ledger JSON backup.' };
  }
  if (payload.expenses.length + payload.sales.length > 10000) {
    return { ok: false, message: 'This backup contains more than 10,000 records. Split it before restoring.' };
  }

  for (const [index, expense] of payload.expenses.entries()) {
    if (!expense || !validDate(expense.date) || typeof expense.category !== 'string' ||
        typeof expense.description !== 'string' || !validNonNegative(expense.qty) ||
        !validNonNegative(expense.price) || !validNonNegative(expense.lineTotal) ||
        (expense.kgPerUnit !== undefined && !validNonNegative(expense.kgPerUnit))) {
      return { ok: false, message: `Backup validation failed: expense record ${index + 1} has invalid fields. No records were changed.` };
    }
  }
  for (const [index, sale] of payload.sales.entries()) {
    if (!sale || !validDate(sale.date) || typeof sale.buyer !== 'string' ||
        !validNonNegative(sale.heads) || !validNonNegative(sale.weightKg) ||
        !validNonNegative(sale.pricePerKg) ||
        (sale.gross !== undefined && !validNonNegative(sale.gross))) {
      return { ok: false, message: `Backup validation failed: sale record ${index + 1} has invalid fields. No records were changed.` };
    }
  }

  const sb = createClient();
  const user = await requireUser(sb);
  const farm = await ensureFarm(sb);
  const { data: ownedBatches, error: batchError } = await sb
    .from('batches')
    .select('id')
    .eq('farm_id', farm.id)
    .eq('user_id', user.id);
  if (batchError) return { ok: false, message: 'Could not validate backup batch references. No records were changed.' };
  const batchIds = new Set((ownedBatches ?? []).map((batch) => String(batch.id)));

  const expenseRows = await Promise.all(payload.expenses.map(async (e, index) => ({
    id: await backupId(e.id, 'expenses', index),
    farm_id: farm.id,
    user_id: user.id,
    date: e.date!,
    category: e.category!,
    description: e.description!,
    item_name: e.itemName || e.description || '',
    expense_type: e.expenseType || 'other',
    batch_id: e.batchId && batchIds.has(e.batchId) ? e.batchId : null,
    qty: e.qty!,
    unit: e.unit || 'Sack',
    price: e.price!,
    kg_per_unit: e.kgPerUnit ?? 0,
    line_total: e.lineTotal!
  })));
  const saleRows = await Promise.all(payload.sales.map(async (s, index) => ({
    id: await backupId(s.id, 'sales', index),
    farm_id: farm.id,
    user_id: user.id,
    date: s.date!,
    buyer: s.buyer!,
    heads: Math.round(s.heads!),
    weight_kg: s.weightKg!,
    price_per_kg: s.pricePerKg!,
    gross: s.gross ?? round2(s.weightKg! * s.pricePerKg!),
    batch_id: s.batchId && batchIds.has(s.batchId) ? s.batchId : null
  })));

  // Merge only: duplicate IDs are skipped and existing records are never deleted or overwritten.
  if (expenseRows.length > 0) {
    const { error } = await sb.from('expenses').upsert(expenseRows, { onConflict: 'id', ignoreDuplicates: true });
    if (error) return { ok: false, message: 'Expense import failed. Existing records were preserved: ' + error.message };
  }
  if (saleRows.length > 0) {
    const { error } = await sb.from('sales').upsert(saleRows, { onConflict: 'id', ignoreDuplicates: true });
    if (error) return { ok: false, message: 'Sales import failed. Existing records were preserved; some expenses may already have been merged: ' + error.message };
  }

  refreshAll();
  return {
    ok: true,
    message: `Backup validated. Merged up to ${expenseRows.length} expense(s) and ${saleRows.length} sale(s). Duplicate IDs were skipped; existing data was not deleted or overwritten.`
  };
}

export async function clearAll(): Promise<void> {
  if (!supabaseConfigured) return;
  const sb = createClient();
  const user = await requireUser(sb);
  const farm = await ensureFarm(sb);
  await sb.from('expenses').delete().eq('farm_id', farm.id).eq('user_id', user.id);
  await sb.from('sales').delete().eq('farm_id', farm.id).eq('user_id', user.id);
  refreshAll();
}
