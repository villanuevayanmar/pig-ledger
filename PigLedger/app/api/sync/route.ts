import { NextResponse } from 'next/server';
import { ensureFarm } from '@/lib/data';
import { num, round2, today } from '@/lib/format';
import { createClient, supabaseConfigured } from '@/lib/supabase/server';
import type { PendingOp } from '@/lib/local-store';

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

async function ownedBatchExists(sb: ReturnType<typeof createClient>, batchId: string, farmId: string, userId: string) {
  const { data, error } = await sb
    .from('batches')
    .select('id')
    .eq('id', batchId)
    .eq('farm_id', farmId)
    .eq('user_id', userId)
    .maybeSingle();
  return !error && Boolean(data);
}

export async function POST(req: Request) {
  if (!supabaseConfigured) {
    return NextResponse.json({ ok: false, message: 'Supabase is not connected yet.' }, { status: 503 });
  }

  let ops: PendingOp[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.ops)) ops = body.ops.slice(0, 200);
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid sync payload.' }, { status: 400 });
  }

  const sb = createClient();
  const { data: authData } = await sb.auth.getUser();
  const user = authData.user;
  if (!user) {
    return NextResponse.json({ ok: false, message: 'Authentication required. Please sign in again.' }, { status: 401 });
  }

  let farm;
  try {
    farm = await ensureFarm(sb);
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not load farm.' }, { status: 500 });
  }

  let applied = 0;
  let failure = '';

  for (const op of ops) {
    try {
      let error: { message: string } | null = null;

      if (op.kind === 'add-batch') {
        const batch = op.batch;
        const result = await sb.from('batches').upsert({
          id: batch.id,
          farm_id: farm.id,
          user_id: user.id,
          name: str(batch.name, 'New batch'),
          start_date: batch.startDate || today(),
          target_sale_date: batch.targetSaleDate || null,
          initial_heads: Math.max(0, Math.round(num(batch.initialHeads))),
          status: batch.status || 'active',
          projection: batch.projection || {}
        }, { onConflict: 'id' });
        error = result.error;
      } else if (op.kind === 'update-batch') {
        const batch = op.batch;
        const result = await sb.from('batches').update({
          name: str(batch.name, 'New batch'),
          start_date: batch.startDate || today(),
          target_sale_date: batch.targetSaleDate || null,
          initial_heads: Math.max(0, Math.round(num(batch.initialHeads))),
          status: batch.status || 'active',
          projection: batch.projection || {}
        }).eq('id', batch.id).eq('farm_id', farm.id).eq('user_id', user.id);
        error = result.error;
      } else if (op.kind === 'add-expense') {
        const expense = op.expense;
        const batchId = expense.batchId || null;
        if (batchId && !(await ownedBatchExists(sb, batchId, farm.id, user.id))) {
          failure = 'The selected batch is not synced yet. Keep the device online and sync again.';
          break;
        }
        const qty = num(expense.qty);
        const price = num(expense.price);
        const result = await sb.from('expenses').insert({
          farm_id: farm.id,
          user_id: user.id,
          date: expense.date || today(),
          category: expense.category || 'Other',
          description: expense.description || '',
          item_name: expense.itemName || expense.description || '',
          expense_type: expense.expenseType || 'other',
          batch_id: batchId,
          qty,
          unit: expense.unit || 'Sack',
          price,
          kg_per_unit: Math.max(0, num(expense.kgPerUnit)),
          line_total: round2(qty * price)
        });
        error = result.error;
      } else if (op.kind === 'delete-expense') {
        if (!String(op.id).startsWith('local-')) {
          const result = await sb.from('expenses').delete().eq('id', op.id).eq('user_id', user.id);
          error = result.error;
        }
      } else if (op.kind === 'add-sale') {
        const sale = op.sale;
        const batchId = sale.batchId || null;
        if (batchId && !(await ownedBatchExists(sb, batchId, farm.id, user.id))) {
          failure = 'The selected batch is not synced yet. Keep the device online and sync again.';
          break;
        }
        const weightKg = num(sale.weightKg);
        const pricePerKg = num(sale.pricePerKg);
        const result = await sb.from('sales').insert({
          farm_id: farm.id,
          user_id: user.id,
          date: sale.date || today(),
          buyer: sale.buyer || '',
          heads: Math.round(num(sale.heads)),
          weight_kg: weightKg,
          price_per_kg: pricePerKg,
          gross: round2(weightKg * pricePerKg),
          batch_id: batchId
        });
        error = result.error;
      } else if (op.kind === 'delete-sale') {
        if (!String(op.id).startsWith('local-')) {
          const result = await sb.from('sales').delete().eq('id', op.id).eq('user_id', user.id);
          error = result.error;
        }
      } else if (op.kind === 'update-farm') {
        const result = await sb.from('farms').update({
          name: str(op.farm.name, farm.name),
          pig_count: Math.max(0, Math.round(num(op.farm.pigCount)))
        }).eq('id', farm.id).eq('user_id', user.id);
        error = result.error;
      }

      if (error) {
        failure = error.message || 'Could not sync this record.';
        break;
      }
      applied++;
    } catch (err) {
      failure = err instanceof Error ? err.message : 'Could not sync this record.';
      break;
    }
  }

  return NextResponse.json({
    ok: true,
    applied,
    total: ops.length,
    completedOps: applied,
    warning: failure || null
  });
}
