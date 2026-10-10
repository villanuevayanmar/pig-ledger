import { NextResponse } from 'next/server';
import { ensureFarm } from '@/lib/data';
import { num, round2, today } from '@/lib/format';
import { createClient, supabaseConfigured } from '@/lib/supabase/server';
import type { PendingOp } from '@/lib/local-store';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

/**
 * POST /api/sync — receive offline queue from the phone.
 * Body: { ops: PendingOp[] }. Last-write-wins: inserts/deletes are replayed
 * in order. Local temp ids (local-*) are NOT sent to Supabase — server rows
 * get real ids, client re-downloads after sync.
 */
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
  const farm = await ensureFarm(sb);
  let applied = 0;

  for (const op of ops) {
    try {
      if (op.kind === 'add-expense') {
        const e = op.expense;
        const qty = num(e.qty);
        const price = num(e.price);
        const { error } = await sb.from('expenses').insert({
          farm_id: farm.id,
          date: e.date || today(),
          category: e.category || 'Other',
          description: e.description || '',
          qty,
          unit: e.unit || 'Sack',
          price,
          line_total: round2(qty * price)
        });
        if (!error) applied++;
      } else if (op.kind === 'delete-expense') {
        if (!String(op.id).startsWith('local-')) {
          await sb.from('expenses').delete().eq('id', op.id);
          applied++;
        } else {
          applied++; // local-only row, nothing to delete on server
        }
      } else if (op.kind === 'add-sale') {
        const s = op.sale;
        const weightKg = num(s.weightKg);
        const pricePerKg = num(s.pricePerKg);
        const { error } = await sb.from('sales').insert({
          farm_id: farm.id,
          date: s.date || today(),
          buyer: s.buyer || '',
          heads: Math.round(num(s.heads)),
          weight_kg: weightKg,
          price_per_kg: pricePerKg,
          gross: round2(weightKg * pricePerKg)
        });
        if (!error) applied++;
      } else if (op.kind === 'delete-sale') {
        if (!String(op.id).startsWith('local-')) {
          await sb.from('sales').delete().eq('id', op.id);
          applied++;
        } else {
          applied++;
        }
      } else if (op.kind === 'update-farm') {
        await sb
          .from('farms')
          .update({
            name: str(op.farm.name, farm.name),
            pig_count: Math.max(0, Math.round(num(op.farm.pigCount)))
          })
          .eq('id', farm.id);
        applied++;
      }
    } catch {
      // Skip bad op, continue with the rest.
    }
  }

  return NextResponse.json({ ok: true, applied, total: ops.length });
}
