'use client';

import { useEffect, useMemo, useState } from 'react';
import SyncStatus from '@/components/SyncStatus';
import { fmt, fmtKg, num, round2, today } from '@/lib/format';
import {
  loadLocalLedger, makeLocalId, saveLocalLedger, type LocalLedger
} from '@/lib/local-store';
import {
  calculateFeedStock, calculatePopulation
} from '@/lib/farm-operations.mjs';
import {
  FEED_CATEGORIES, UNITS,
  type FeedProduct, type PopulationMovement, type FeedInventoryMovement, type FeedConsumptionRecord
} from '@/lib/types';
import { syncLedgerNow } from '@/components/ExpensesClient';

const MOVEMENT_LABELS: Record<string, string> = {
  purchase: 'New piglets added',
  mortality: 'Mortality',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  adjustment_in: 'Count adjustment (+)',
  adjustment_out: 'Count adjustment (-)'
};

export default function OperationsClient() {
  const [ledger, setLedger] = useState<LocalLedger | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    syncLedgerNow().then(setLedger).catch((err) => setError(err instanceof Error ? err.message : 'Could not load farm data.'));
  }, []);

  const activeBatches = useMemo(
    () => (ledger?.batches ?? []).filter((batch) => batch.status === 'active'),
    [ledger]
  );
  const feedStock = useMemo(
    () => ledger ? calculateFeedStock(ledger.feedInventoryMovements, ledger.feedConsumption) : null,
    [ledger]
  );
  const batchPopulation = useMemo(() => {
    if (!ledger) return [];
    return ledger.batches.filter((batch) => batch.status !== 'archived').map((batch) => {
      const movements = ledger.populationMovements.filter((item) => item.batchId === batch.id);
      const sales = ledger.sales.filter((item) => item.batchId === batch.id);
      const opening = movements.some((item) => item.movementType === 'opening')
        ? movements
        : [{ id: 'opening-' + batch.id, farmId: batch.farmId, batchId: batch.id, movementDate: batch.startDate, movementType: 'opening' as const, heads: batch.initialHeads, notes: '' }, ...movements];
      const total = calculatePopulation(opening, sales);
      return { batch, total };
    });
  }, [ledger]);

  async function updateLocal(mutator: (local: LocalLedger) => void) {
    const local = await loadLocalLedger();
    mutator(local);
    await saveLocalLedger(local);
    setLedger({ ...local });
    setMessage('Saved on this device. Synchronizing…');
    setError('');
    try {
      const synced = await syncLedgerNow();
      setLedger(synced);
      if (synced.syncError) {
        setMessage('Saved locally. Sync is still pending.');
        setError(synced.syncError);
      } else {
        setMessage('Saved and synchronized.');
      }
    } catch (err) {
      setMessage('Saved locally. Sync will retry when connection returns.');
      setError(err instanceof Error ? err.message : 'Sync is unavailable.');
    }
  }

  async function handlePopulation(formData: FormData) {
    const batchId = String(formData.get('batchId') || '');
    const movementType = String(formData.get('movementType') || '');
    const heads = Math.floor(num(formData.get('heads')));
    const batch = ledger?.batches.find((item) => item.id === batchId);
    if (!batch || !['purchase', 'mortality', 'transfer_in', 'transfer_out', 'adjustment_in', 'adjustment_out'].includes(movementType) || heads <= 0) {
      setError('Choose a batch, movement type, and a valid whole number of pigs.');
      return;
    }
    const batchSummary = batchPopulation.find((item) => item.batch.id === batchId)?.total;
    if (batchSummary && ['mortality', 'transfer_out', 'adjustment_out'].includes(movementType) && heads > batchSummary.currentHeads) {
      setError('This movement is greater than the current recorded pig count for this batch.');
      return;
    }
    const movement: PopulationMovement = {
      id: crypto.randomUUID(),
      farmId: batch.farmId,
      batchId,
      movementDate: String(formData.get('movementDate') || today()),
      movementType: movementType as PopulationMovement['movementType'],
      heads,
      notes: String(formData.get('notes') || '').trim()
    };
    await updateLocal((local) => {
      local.populationMovements = [...local.populationMovements, movement];
      local.pending = [...local.pending, { kind: 'add-population-movement', movement }];
    });
  }

  async function handleProduct(formData: FormData) {
    const name = String(formData.get('name') || '').trim();
    const category = String(formData.get('category') || 'Other Feed');
    const unit = String(formData.get('unit') || 'Sack');
    const kgPerUnit = num(formData.get('kgPerUnit'));
    if (!name || kgPerUnit <= 0) {
      setError('Enter a feed name and a kilograms-per-unit value greater than zero.');
      return;
    }
    if (ledger?.feedProducts.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      setError('A feed product with that name already exists.');
      return;
    }
    const product: FeedProduct = {
      id: crypto.randomUUID(),
      farmId: ledger?.farm.id ?? '',
      name, category, unit, kgPerUnit, isActive: true,
      createdAt: new Date().toISOString()
    };
    await updateLocal((local) => {
      local.feedProducts = [...local.feedProducts, product];
      local.pending = [...local.pending, { kind: 'add-feed-product', product }];
    });
  }

  async function handlePurchase(formData: FormData) {
    const productId = String(formData.get('productId') || '');
    const quantityUnits = num(formData.get('quantityUnits'));
    const unitCost = num(formData.get('unitCost'));
    const movementDate = String(formData.get('movementDate') || today());
    const product = ledger?.feedProducts.find((item) => item.id === productId);
    if (!product || quantityUnits <= 0 || unitCost < 0) {
      setError('Choose a feed product and enter a valid quantity and unit cost.');
      return;
    }
    const movement: FeedInventoryMovement = {
      id: crypto.randomUUID(),
      farmId: product.farmId,
      productId,
      movementDate,
      movementType: 'purchase',
      quantityUnits,
      kgPerUnitSnapshot: product.kgPerUnit,
      unitCost,
      notes: String(formData.get('notes') || '').trim()
    };
    const expenseId = makeLocalId('local-exp');
    const expense = {
      id: expenseId,
      date: movementDate,
      category: product.category,
      description: 'Feed purchase: ' + product.name,
      qty: quantityUnits,
      unit: product.unit,
      price: unitCost,
      lineTotal: round2(quantityUnits * unitCost),
      expenseType: 'feed',
      itemName: product.name,
      kgPerUnit: product.kgPerUnit
    };
    await updateLocal((local) => {
      local.feedInventoryMovements = [...local.feedInventoryMovements, movement];
      local.expenses = [expense, ...local.expenses];
      local.pending = [
        ...local.pending,
        { kind: 'add-expense', expense },
        { kind: 'add-feed-inventory', movement }
      ];
    });
  }

  async function handleAdjustment(formData: FormData) {
    const productId = String(formData.get('productId') || '');
    const quantityUnits = num(formData.get('quantityUnits'));
    const movementType = String(formData.get('movementType') || 'adjustment_in');
    const product = ledger?.feedProducts.find((item) => item.id === productId);
    if (!product || quantityUnits <= 0 || movementType !== 'adjustment_in') {
      setError('Choose a product and enter a valid positive adjustment quantity.');
      return;
    }
    const movement: FeedInventoryMovement = {
      id: makeLocalId('local-stock'),
      farmId: product.farmId,
      productId,
      movementDate: String(formData.get('movementDate') || today()),
      movementType: 'adjustment_in',
      quantityUnits,
      kgPerUnitSnapshot: product.kgPerUnit,
      unitCost: 0,
      notes: String(formData.get('notes') || 'Opening stock / stock correction').trim()
    };
    await updateLocal((local) => {
      local.feedInventoryMovements = [...local.feedInventoryMovements, movement];
      local.pending = [...local.pending, { kind: 'add-feed-inventory', movement }];
    });
  }

  async function handleConsumption(formData: FormData) {
    const productId = String(formData.get('productId') || '');
    const batchId = String(formData.get('batchId') || '');
    const quantityUnits = num(formData.get('quantityUnits'));
    const product = ledger?.feedProducts.find((item) => item.id === productId && item.isActive);
    const batch = activeBatches.find((item) => item.id === batchId);
    if (!product || !batch || quantityUnits <= 0) {
      setError('Choose an active feed product, an active batch, and a positive quantity.');
      return;
    }
    const current = feedStock?.products.find((item) => item.productId === productId);
    const availableKg = current?.stockKg ?? 0;
    const requestedKg = quantityUnits * product.kgPerUnit;
    if (requestedKg > availableKg + 0.000001) {
      setError('Not enough recorded stock. Available: ' + fmtKg(availableKg) + '; requested: ' + fmtKg(requestedKg) + '.');
      return;
    }
    const consumption: FeedConsumptionRecord = {
      id: crypto.randomUUID(),
      farmId: product.farmId,
      batchId,
      productId,
      consumptionDate: String(formData.get('consumptionDate') || today()),
      quantityUnits,
      kgPerUnitSnapshot: product.kgPerUnit,
      notes: String(formData.get('notes') || '').trim()
    };
    await updateLocal((local) => {
      local.feedConsumption = [...local.feedConsumption, consumption];
      local.pending = [...local.pending, { kind: 'add-feed-consumption', consumption }];
    });
  }

  if (!ledger) {
    return <div className="card text-center"><p className="muted">Loading farm operations…</p></div>;
  }

  return (
    <div className="space-y-4">
      <SyncStatus pending={ledger.pending.length} syncError={ledger.syncError} onSync={async () => setLedger(await syncLedgerNow())} />
      <div>
        <h2 className="section-title">Farm Operations</h2>
        <p className="section-sub">Track your pig population, feed inventory, and actual feed consumption.</p>
      </div>
      {!ledger.operationsSchemaReady ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Database setup required.</strong> These records can be saved on this device, but online synchronization needs the Phase 2 farm-operations migration to be applied to your Supabase database first.
        </div>
      ) : null}
      {message ? <p className="text-sm text-emerald-700" role="status">{message}</p> : null}
      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">{error}</p> : null}

      <section className="card space-y-3">
        <div>
          <h3 className="font-semibold">Pig population by batch</h3>
          <p className="text-xs text-slate-500">Sales are deducted automatically. Do not enter a second sale movement here.</p>
        </div>
        {batchPopulation.length === 0 ? <p className="muted">Create a batch before recording pig movements.</p> : (
          <div className="space-y-2">
            {batchPopulation.map(({ batch, total }) => (
              <div key={batch.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm">{batch.name}</strong>
                  <strong className={total.hasOverdraw ? 'text-rose-700' : 'text-slate-900'}>{total.currentHeads} head(s)</strong>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Started with {batch.initialHeads} · Added {total.purchase + total.transferIn + total.adjustmentIn} · Mortality {total.mortality} · Sold {total.sold} · Out {total.transferOut + total.adjustmentOut}
                </p>
                {total.hasOverdraw ? <p className="mt-2 text-xs font-semibold text-rose-700">Recorded movements exceed the available population. Review this batch.</p> : null}
              </div>
            ))}
          </div>
        )}
        {activeBatches.length > 0 ? (
          <form action={handlePopulation} className="space-y-3 border-t border-slate-100 pt-3">
            <h4 className="text-sm font-semibold">Record a population movement</h4>
            <div className="grid grid-cols-2 gap-3">
              <label><span className="label">Batch</span><select className="input" name="batchId" required>{activeBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}</select></label>
              <label><span className="label">Movement</span><select className="input" name="movementType">{Object.entries(MOVEMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label><span className="label">Date</span><input className="input" type="date" name="movementDate" defaultValue={today()} required /></label>
              <label><span className="label">Number of pigs</span><input className="input" name="heads" type="number" min="1" step="1" inputMode="numeric" required /></label>
            </div>
            <label className="block"><span className="label">Notes (optional)</span><input className="input" name="notes" placeholder="Reason or details" /></label>
            <button className="btn-primary w-full" type="submit">Save population movement</button>
          </form>
        ) : null}
      </section>

      <section className="card space-y-3">
        <div>
          <h3 className="font-semibold">Feed inventory</h3>
          <p className="text-xs text-slate-500">Stock is calculated separately for every product. Purchases also create an expense.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Purchased" value={fmtKg(feedStock?.purchasedKg ?? 0)} />
          <Stat label="Consumed" value={fmtKg(feedStock?.consumedKg ?? 0)} />
        </div>
        {ledger.feedProducts.length > 0 ? (
          <div className="space-y-2">
            {ledger.feedProducts.map((product) => {
              const stock = feedStock?.products.find((item) => item.productId === product.id);
              return (
                <div key={product.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{product.name}</p>
                    <p className="text-xs text-slate-500">{product.category} · {product.kgPerUnit} kg per {product.unit.toLowerCase()}</p>
                  </div>
                  <div className="text-right">
                    <p className={'font-bold tabular-nums ' + (stock?.hasNegativeStock ? 'text-rose-700' : 'text-slate-900')}>{fmtKg(stock?.stockKg ?? 0)}</p>
                    <p className="text-[11px] text-slate-500">In stock</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : <p className="muted">Add your feed products below to start tracking stock.</p>}

        <form action={handleProduct} className="space-y-3 border-t border-slate-100 pt-3">
          <h4 className="text-sm font-semibold">Add feed product</h4>
          <label className="block"><span className="label">Product name</span><input className="input" name="name" placeholder="e.g. Starter feed" required /></label>
          <div className="grid grid-cols-2 gap-3">
            <label><span className="label">Feed category</span><select name="category" className="input">{FEED_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className="label">Purchase unit</span><select name="unit" className="input">{UNITS.filter((item) => ['Sack', 'Kg', 'Bag'].includes(item)).map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <label className="block"><span className="label">Kilograms per unit</span><input className="input" name="kgPerUnit" type="number" min="0.01" step="any" placeholder="e.g. 50" required /></label>
          <button className="btn-secondary w-full" type="submit">Save feed product</button>
        </form>

        {ledger.feedProducts.some((product) => product.isActive) ? (
          <>
            <form action={handlePurchase} className="space-y-3 border-t border-slate-100 pt-3">
              <h4 className="text-sm font-semibold">Record feed purchase</h4>
              <label className="block"><span className="label">Feed product</span><select className="input" name="productId">{ledger.feedProducts.filter((product) => product.isActive).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-3">
                <label><span className="label">Date</span><input className="input" name="movementDate" type="date" defaultValue={today()} required /></label>
                <label><span className="label">Quantity (units)</span><input className="input" name="quantityUnits" type="number" min="0.01" step="any" required /></label>
              </div>
              <label className="block"><span className="label">Cost per unit (₱)</span><input className="input" name="unitCost" type="number" min="0" step="0.01" required /></label>
              <label className="block"><span className="label">Notes (optional)</span><input className="input" name="notes" /></label>
              <button className="btn-primary w-full" type="submit">Record purchase and expense</button>
            </form>
            <form action={handleAdjustment} className="space-y-3 border-t border-slate-100 pt-3">
              <h4 className="text-sm font-semibold">Record opening / stock adjustment</h4>
              <label className="block"><span className="label">Feed product</span><select className="input" name="productId">{ledger.feedProducts.filter((product) => product.isActive).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-3">
                <label><span className="label">Date</span><input className="input" name="movementDate" type="date" defaultValue={today()} required /></label>
                <label><span className="label">Stock to add (units)</span><input className="input" name="quantityUnits" type="number" min="0.01" step="any" required /></label>
              </div>
              <label className="block"><span className="label">Notes</span><input className="input" name="notes" defaultValue="Opening stock / stock correction" /></label>
              <button className="btn-secondary w-full" type="submit">Add stock adjustment</button>
            </form>
          </>
        ) : null}
      </section>

      <section className="card space-y-3">
        <div>
          <h3 className="font-semibold">Actual feed consumption</h3>
          <p className="text-xs text-slate-500">Consumption is assigned to a batch and deducted from that product's stock.</p>
        </div>
        {ledger.feedProducts.some((product) => product.isActive) && activeBatches.length > 0 ? (
          <form action={handleConsumption} className="space-y-3">
            <label className="block"><span className="label">Feed product</span><select className="input" name="productId">{ledger.feedProducts.filter((product) => product.isActive).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
            <label className="block"><span className="label">Batch</span><select className="input" name="batchId">{activeBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-3">
              <label><span className="label">Date</span><input className="input" name="consumptionDate" type="date" defaultValue={today()} required /></label>
              <label><span className="label">Quantity (units)</span><input className="input" name="quantityUnits" type="number" min="0.01" step="any" required /></label>
            </div>
            <label className="block"><span className="label">Notes (optional)</span><input className="input" name="notes" /></label>
            <button className="btn-primary w-full" type="submit">Record feed consumption</button>
          </form>
        ) : <p className="muted">Add a feed product and create an active batch before recording consumption.</p>}
        {ledger.feedConsumption.length > 0 ? (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <h4 className="text-sm font-semibold">Recent consumption records</h4>
            {ledger.feedConsumption.slice(-6).reverse().map((item) => {
              const product = ledger.feedProducts.find((entry) => entry.id === item.productId);
              const batch = ledger.batches.find((entry) => entry.id === item.batchId);
              return <div key={item.id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate">{product?.name ?? 'Feed'} · {batch?.name ?? 'Batch'} · {item.consumptionDate}</span><strong className="shrink-0">{fmtKg(item.quantityUnits * item.kgPerUnitSnapshot)}</strong></div>;
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-lg font-bold tabular-nums">{value}</p></div>;
}
