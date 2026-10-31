import { NextResponse } from 'next/server';
import { ensureFarm } from '@/lib/data';
import { num, round2, today } from '@/lib/format';
import { createClient, supabaseConfigured } from '@/lib/supabase/server';
import type { PendingOp } from '@/lib/local-store';
import { deterministicUuid } from '@/lib/idempotency.mjs';


function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function stableUuid(value: string): Promise<string> {
  return isUuid(value) ? value : deterministicUuid(`pig-ledger:${value}`);
}

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
        const result = await sb.from('expenses').upsert({
          id: await deterministicUuid(`pig-ledger:${expense.id}`),
          farm_id: farm.id,
          user_id: user.id,
          date: expense.date || today(),
          category: expense.category || 'Other',
          description: expense.description || '',
          item_name: expense.itemName || expense.description || '',
          supplier_id: expense.supplierId || null,
          expense_type: expense.expenseType || 'other',
          batch_id: batchId,
          qty,
          unit: expense.unit || 'Sack',
          price,
          kg_per_unit: Math.max(0, num(expense.kgPerUnit)),
          line_total: round2(qty * price)
        }, { onConflict: 'id' });
        error = result.error;
      } else if (op.kind === 'update-expense') {
        const expense = op.expense;
        const batchId = expense.batchId || null;
        if (batchId && !(await ownedBatchExists(sb, batchId, farm.id, user.id))) {
          failure = 'The selected batch is not synced yet. Keep the device online and sync again.';
          break;
        }
        const qty = num(expense.qty);
        const price = num(expense.price);
        const result = await sb.from('expenses').update({
          date: expense.date || today(), category: expense.category || 'Other',
          description: expense.description || '', item_name: expense.itemName || expense.description || '',
          expense_type: expense.expenseType || 'other', batch_id: batchId,
          supplier_id: expense.supplierId || null,
          qty, unit: expense.unit || 'Sack', price,
          kg_per_unit: Math.max(0, num(expense.kgPerUnit)), line_total: round2(qty * price)
        }).eq('id', expense.id).eq('farm_id', farm.id).eq('user_id', user.id);
        error = result.error;
      } else if (op.kind === 'delete-expense') {
        const deleteId = String(op.id).startsWith('local-') ? await deterministicUuid(`pig-ledger:${op.id}`) : op.id;
        const result = await sb.from('expenses').delete().eq('id', deleteId).eq('user_id', user.id);
        error = result.error;
      } else if (op.kind === 'add-sale') {
        const sale = op.sale;
        const batchId = sale.batchId || null;
        if (batchId && !(await ownedBatchExists(sb, batchId, farm.id, user.id))) {
          failure = 'The selected batch is not synced yet. Keep the device online and sync again.';
          break;
        }
        const weightKg = num(sale.weightKg);
        const pricePerKg = num(sale.pricePerKg);
        const result = await sb.from('sales').upsert({
          id: await deterministicUuid(`pig-ledger:${sale.id}`),
          farm_id: farm.id,
          user_id: user.id,
          date: sale.date || today(),
          buyer: sale.buyer || '',
          heads: Math.round(num(sale.heads)),
          weight_kg: weightKg,
          price_per_kg: pricePerKg,
          gross: round2(weightKg * pricePerKg),
          batch_id: batchId,
          customer_id: sale.customerId || null
        }, { onConflict: 'id' });
        error = result.error;
      } else if (op.kind === 'update-sale') {
        const sale = op.sale;
        const batchId = sale.batchId || null;
        if (batchId && !(await ownedBatchExists(sb, batchId, farm.id, user.id))) {
          failure = 'The selected batch is not synced yet. Keep the device online and sync again.';
          break;
        }
        const weightKg = num(sale.weightKg);
        const pricePerKg = num(sale.pricePerKg);
        const result = await sb.from('sales').update({
          date: sale.date || today(), buyer: sale.buyer || '', heads: Math.round(num(sale.heads)),
          weight_kg: weightKg, price_per_kg: pricePerKg,
          gross: round2(weightKg * pricePerKg), batch_id: batchId,
          customer_id: sale.customerId || null
        }).eq('id', sale.id).eq('farm_id', farm.id).eq('user_id', user.id);
        error = result.error;
      } else if (op.kind === 'delete-sale') {
        const deleteId = String(op.id).startsWith('local-') ? await deterministicUuid(`pig-ledger:${op.id}`) : op.id;
        const result = await sb.from('sales').delete().eq('id', deleteId).eq('user_id', user.id);
        error = result.error;
      } else if (op.kind === 'add-population-movement') {
        const movement = op.movement;
        const result = await sb.rpc('record_population_movement', {
          p_id: await stableUuid(movement.id),
          p_farm_id: farm.id,
          p_batch_id: movement.batchId,
          p_movement_date: movement.movementDate || today(),
          p_movement_type: movement.movementType,
          p_heads: Math.max(1, Math.floor(num(movement.heads))),
          p_notes: str(movement.notes)
        });
        error = result.error;
      } else if (op.kind === 'add-feed-product') {
        const product = op.product;
        const result = await sb.from('feed_products').upsert({
          id: product.id,
          farm_id: farm.id,
          user_id: user.id,
          name: str(product.name),
          category: str(product.category, 'Other Feed'),
          unit: str(product.unit, 'Sack'),
          kg_per_unit: num(product.kgPerUnit),
          is_active: product.isActive !== false
        }, { onConflict: 'id' });
        error = result.error;
      } else if (op.kind === 'add-feed-inventory') {
        const movement = op.movement;
        const result = await sb.rpc('record_feed_inventory_movement', {
          p_id: await stableUuid(movement.id),
          p_farm_id: farm.id,
          p_product_id: movement.productId,
          p_movement_date: movement.movementDate || today(),
          p_movement_type: movement.movementType,
          p_quantity_units: num(movement.quantityUnits),
          p_kg_per_unit_snapshot: num(movement.kgPerUnitSnapshot),
          p_unit_cost: num(movement.unitCost),
          p_notes: str(movement.notes)
        });
        error = result.error;
      } else if (op.kind === 'add-feed-consumption') {
        const consumption = op.consumption;
        const result = await sb.rpc('record_feed_consumption', {
          p_id: await stableUuid(consumption.id),
          p_farm_id: farm.id,
          p_batch_id: consumption.batchId,
          p_product_id: consumption.productId,
          p_consumption_date: consumption.consumptionDate || today(),
          p_quantity_units: num(consumption.quantityUnits),
          p_kg_per_unit_snapshot: num(consumption.kgPerUnitSnapshot),
          p_notes: str(consumption.notes)
        });
        error = result.error;
      } else if (op.kind === 'add-weight-record') {
        const record = op.record;
        const result = await sb.from('weight_records').upsert({
          id: await stableUuid(record.id),
          farm_id: farm.id,
          batch_id: record.batchId,
          user_id: user.id,
          measured_on: record.measuredOn || today(),
          head_count: Math.max(1, Math.floor(num(record.headCount))),
          average_weight_kg: num(record.averageWeightKg),
          notes: str(record.notes)
        }, { onConflict: 'id', ignoreDuplicates: true });
        error = result.error;
      } else if (op.kind === 'add-health-record') {
        const record = op.record;
        const expenseId = record.expenseId ? await stableUuid(record.expenseId) : null;
        const result = await sb.from('health_records').upsert({
          id: await stableUuid(record.id),
          farm_id: farm.id,
          batch_id: record.batchId,
          user_id: user.id,
          record_date: record.recordDate || today(),
          record_type: record.recordType,
          title: str(record.title),
          symptoms: str(record.symptoms),
          medicine: str(record.medicine),
          dosage: str(record.dosage),
          treated_heads: Math.max(0, Math.floor(num(record.treatedHeads))),
          cost: num(record.cost),
          expense_id: expenseId,
          next_due_date: record.nextDueDate || null,
          notes: str(record.notes)
        }, { onConflict: 'id', ignoreDuplicates: true });
        error = result.error;
      } else if (op.kind === 'add-customer') {
        const customer = op.customer;
        const result = await sb.from('customers').upsert({
          id: await stableUuid(customer.id),
          farm_id: farm.id,
          user_id: user.id,
          name: str(customer.name),
          phone: str(customer.phone),
          email: str(customer.email),
          address: str(customer.address),
          notes: str(customer.notes),
          is_active: customer.isActive !== false
        }, { onConflict: 'id', ignoreDuplicates: true });
        error = result.error;
      } else if (op.kind === 'add-supplier') {
        const supplier = op.supplier;
        const result = await sb.from('suppliers').upsert({
          id: await stableUuid(supplier.id),
          farm_id: farm.id,
          user_id: user.id,
          name: str(supplier.name),
          phone: str(supplier.phone),
          email: str(supplier.email),
          address: str(supplier.address),
          notes: str(supplier.notes),
          is_active: supplier.isActive !== false
        }, { onConflict: 'id', ignoreDuplicates: true });
        error = result.error;
      } else if (op.kind === 'add-sale-payment') {
        const payment = op.payment;
        const result = await sb.rpc('record_sale_payment', {
          p_id: await stableUuid(payment.id),
          p_farm_id: farm.id,
          p_sale_id: await stableUuid(payment.saleId),
          p_payment_date: payment.paymentDate || today(),
          p_amount: num(payment.amount),
          p_payment_method: payment.paymentMethod,
          p_reference: str(payment.reference),
          p_notes: str(payment.notes)
        });
        error = result.error;
      } else if (op.kind === 'update-farm') {
        const result = await sb.from('farms').update({
          name: str(op.farm.name, farm.name),
          pig_count: Math.max(0, Math.round(num(op.farm.pigCount)))
        }).eq('id', farm.id).eq('user_id', user.id);
        error = result.error;
      }

      if (!['add-batch', 'update-batch', 'add-expense', 'update-expense', 'delete-expense', 'add-sale', 'update-sale', 'delete-sale', 'add-population-movement', 'add-feed-product', 'add-feed-inventory', 'add-feed-consumption', 'add-weight-record', 'add-health-record', 'add-customer', 'add-supplier', 'add-sale-payment', 'update-farm'].includes((op as { kind?: string }).kind ?? '')) {
        failure = 'Unsupported sync operation. The record was kept in the local queue.';
        break;
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
    ok: !failure,
    applied,
    total: ops.length,
    completedOps: applied,
    warning: failure || null
  }, { status: failure ? 207 : 200 });
}
