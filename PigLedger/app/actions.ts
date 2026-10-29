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
  farm?: { name?: string; pigCount?: number };
  expenses?: Partial<Expense>[];
  sales?: Partial<Sale>[];
};

export async function importAll(payloadJson: string): Promise<{ ok: boolean; message: string }> {
  if (!supabaseConfigured) return { ok: false, message: 'Supabase is not connected yet.' };

  let payload: BackupPayload;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return { ok: false, message: 'This file is not valid JSON.' };
  }
  const hasAny =
    payload && typeof payload === 'object' && (Array.isArray(payload.expenses) || Array.isArray(payload.sales));
  if (!hasAny) return { ok: false, message: 'This file is not a Pig Farm Ledger backup.' };

  const sb = createClient();
  const user = await requireUser(sb);
  const farm = await ensureFarm(sb);

  await sb.from('expenses').delete().eq('farm_id', farm.id).eq('user_id', user.id);
  await sb.from('sales').delete().eq('farm_id', farm.id).eq('user_id', user.id);

  if (payload.farm) {
    await sb.from('farms').update({
      name: str(payload.farm.name as string, farm.name),
      pig_count: Math.max(0, Math.round(num(payload.farm.pigCount)))
    }).eq('id', farm.id).eq('user_id', user.id);
  }

  const expenseRows = (payload.expenses ?? []).map((e) => {
    const qty = num(e.qty);
    const price = num(e.price);
    return {
      farm_id: farm.id,
      user_id: user.id,
      date: e.date || today(),
      category: e.category || 'Other',
      description: e.description || '',
      qty,
      unit: e.unit || 'Sack',
      price,
      line_total: e.lineTotal === undefined ? round2(qty * price) : num(e.lineTotal)
    };
  });
  if (expenseRows.length > 0) {
    const { error } = await sb.from('expenses').insert(expenseRows);
    if (error) return { ok: false, message: 'Expenses restore failed: ' + error.message };
  }

  const saleRows = (payload.sales ?? []).map((s) => {
    const weightKg = num(s.weightKg);
    const pricePerKg = num(s.pricePerKg);
    return {
      farm_id: farm.id,
      user_id: user.id,
      date: s.date || today(),
      buyer: s.buyer || '',
      heads: Math.round(num(s.heads)),
      weight_kg: weightKg,
      price_per_kg: pricePerKg,
      gross: s.gross === undefined ? round2(weightKg * pricePerKg) : num(s.gross)
    };
  });
  if (saleRows.length > 0) {
    const { error } = await sb.from('sales').insert(saleRows);
    if (error) return { ok: false, message: 'Sales restore failed: ' + error.message };
  }

  refreshAll();
  return {
    ok: true,
    message: `Restored ${expenseRows.length} expense(s) and ${saleRows.length} sale(s).`
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
