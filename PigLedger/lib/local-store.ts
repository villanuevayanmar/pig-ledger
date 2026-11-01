import type { Batch, Expense, Farm, Sale, PopulationMovement, FeedProduct, FeedInventoryMovement, FeedConsumptionRecord, WeightRecord, HealthRecord, Customer, Supplier, SalePayment } from './types';
import { canMigrateLegacyLedger } from './legacy-migration.mjs';
import { mergeServerRecordsWithPending } from './pending-records.mjs';
import { deterministicUuid } from './idempotency.mjs';
import { createBrowserClientApp } from './supabase/client';

export type PendingOp =
  | { kind: 'add-expense'; expense: Expense }
  | { kind: 'delete-expense'; id: string }
  | { kind: 'update-expense'; expense: Expense }
  | { kind: 'add-sale'; sale: Sale }
  | { kind: 'delete-sale'; id: string }
  | { kind: 'update-sale'; sale: Sale }
  | { kind: 'add-batch'; batch: Batch }
  | { kind: 'update-batch'; batch: Batch }
  | { kind: 'update-farm'; farm: Farm }
  | { kind: 'add-population-movement'; movement: PopulationMovement }
  | { kind: 'add-feed-product'; product: FeedProduct }
  | { kind: 'add-feed-inventory'; movement: FeedInventoryMovement }
  | { kind: 'add-feed-consumption'; consumption: FeedConsumptionRecord }
  | { kind: 'add-weight-record'; record: WeightRecord }
  | { kind: 'add-health-record'; record: HealthRecord }
  | { kind: 'add-customer'; customer: Customer }
  | { kind: 'add-supplier'; supplier: Supplier }
  | { kind: 'add-sale-payment'; payment: SalePayment };

export type LocalLedger = {
  farm: Farm;
  batches: Batch[];
  expenses: Expense[];
  sales: Sale[];
  populationMovements: PopulationMovement[];
  feedProducts: FeedProduct[];
  feedInventoryMovements: FeedInventoryMovement[];
  feedConsumption: FeedConsumptionRecord[];
  weightRecords: WeightRecord[];
  healthRecords: HealthRecord[];
  customers: Customer[];
  suppliers: Supplier[];
  salePayments: SalePayment[];
  pending: PendingOp[];
  syncError?: string | null;
  operationsSchemaReady?: boolean;
  monitoringSchemaReady?: boolean;
  businessSchemaReady?: boolean;
  updatedAt: string;
};

const DB_NAME = 'pig-ledger-db';
const STORE = 'ledger';
const LEGACY_KEY = 'ledger-v1';
const OWNER_KEY = 'pig-ledger-owner';
const LEGACY_OWNER_KEY = 'pig-ledger-legacy-owner';

function legacyOwnerForMigration(): string | null {
  if (typeof window === 'undefined') return null;
  // This marker is written only after the user explicitly confirms recovery.
  // OWNER_KEY is only the last signed-in account and is not proof of ownership
  // of the old shared ledger after an account switch.
  return window.localStorage.getItem(LEGACY_OWNER_KEY);
}

function legacyMigrationKey(userId: string): string {
  return 'ledger-v1-migrated:' + userId;
}

async function scopedKey(): Promise<string> {
  let userId = '';
  try {
    const { data } = await createBrowserClientApp().auth.getSession();
    userId = data.session?.user.id ?? '';
  } catch {
    // Do not fall back to another account's browser cache.
  }
  if (!userId) throw new Error('Your account could not be identified. Sign in again before opening offline records.');

  const farmId = typeof window !== 'undefined' ? window.localStorage.getItem('pig-ledger-active-farm:' + userId) : null;
  const key = 'ledger-v2:' + userId + ':' + (farmId || 'default');
  const legacyOwnerId = legacyOwnerForMigration();
  if (farmId && legacyOwnerId === userId) {
    await migrateLegacyLedgerOnce(userId, farmId, legacyOwnerId);
  }
  if (typeof window !== 'undefined') window.localStorage.setItem(OWNER_KEY, userId);
  return key;
}

function defaultFarm(): Farm {
  return { id: 'local-farm', name: 'My Piggery', pigCount: 0, startDate: '' };
}

export function defaultLedger(): LocalLedger {
  return {
    farm: defaultFarm(),
    batches: [],
    expenses: [],
    sales: [],
    populationMovements: [],
    feedProducts: [],
    feedInventoryMovements: [],
    feedConsumption: [],
    weightRecords: [],
    healthRecords: [],
    customers: [],
    suppliers: [],
    salePayments: [],
    pending: [],
    syncError: null,
    operationsSchemaReady: false,
    monitoringSchemaReady: false,
    businessSchemaReady: false,
    updatedAt: new Date().toISOString()
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

async function idbGet<T = LocalLedger>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as T) ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function idbSet(ledger: LocalLedger, key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ ...ledger, updatedAt: new Date().toISOString() }, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function migrateLegacyLedgerOnce(userId: string, farmId: string, legacyOwnerId: string): Promise<void> {
  const db = await openDb();
  const targetKey = 'ledger-v2:' + userId + ':' + farmId;
  const markerKey = legacyMigrationKey(userId);

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const ready = { target: false, marker: false, legacy: false };
    let target: LocalLedger | null = null;
    let marker: { farmId?: string } | null = null;
    let legacy: LocalLedger | null = null;

    const evaluate = () => {
      if (!ready.target || !ready.marker || !ready.legacy) return;
      if (marker || !legacy) return;
      const allowed = canMigrateLegacyLedger({
        legacyOwnerId,
        userId,
        legacyFarmId: legacy.farm?.id ?? null,
        activeFarmId: farmId,
        migrationComplete: false
      });
      if (!allowed) return;

      // The read/write transaction serializes concurrent tabs. The first
      // selected farm claims the legacy copy; later farm scopes cannot copy it.
      // Merge if the scoped key already exists so a prior session's records
      // are not overwritten by the one-time legacy migration.
      const migrated: LocalLedger = target ? {
        ...legacy,
        ...target,
        farm: target.farm?.id === farmId ? target.farm : legacy.farm,
        batches: mergeById(legacy.batches ?? [], target.batches ?? []),
        expenses: mergeById(legacy.expenses ?? [], target.expenses ?? []),
        sales: mergeById(legacy.sales ?? [], target.sales ?? []),
        populationMovements: mergeById(legacy.populationMovements ?? [], target.populationMovements ?? []),
        feedProducts: mergeById(legacy.feedProducts ?? [], target.feedProducts ?? []),
        feedInventoryMovements: mergeById(legacy.feedInventoryMovements ?? [], target.feedInventoryMovements ?? []),
        feedConsumption: mergeById(legacy.feedConsumption ?? [], target.feedConsumption ?? []),
        weightRecords: mergeById(legacy.weightRecords ?? [], target.weightRecords ?? []),
        healthRecords: mergeById(legacy.healthRecords ?? [], target.healthRecords ?? []),
        customers: mergeById(legacy.customers ?? [], target.customers ?? []),
        suppliers: mergeById(legacy.suppliers ?? [], target.suppliers ?? []),
        salePayments: mergeById(legacy.salePayments ?? [], target.salePayments ?? []),
        pending: [...(legacy.pending ?? []), ...(target.pending ?? [])].filter((op, index, all) =>
          all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(op)) === index
        )
      } : legacy;
      store.put(migrated, targetKey);
      store.put({ farmId, migratedAt: new Date().toISOString() }, markerKey);
    };

    const targetRequest = store.get(targetKey);
    const markerRequest = store.get(markerKey);
    const legacyRequest = store.get(LEGACY_KEY);
    targetRequest.onsuccess = () => { target = (targetRequest.result as LocalLedger) ?? null; ready.target = true; evaluate(); };
    markerRequest.onsuccess = () => { marker = markerRequest.result ?? null; ready.marker = true; evaluate(); };
    legacyRequest.onsuccess = () => { legacy = (legacyRequest.result as LocalLedger) ?? null; ready.legacy = true; evaluate(); };
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error('Could not migrate the existing offline ledger.')); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('Offline ledger migration was cancelled.')); };
  });
}

export async function hasRecoverableLegacyLedger(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const { data } = await createBrowserClientApp().auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return false;

  const farmId = window.localStorage.getItem('pig-ledger-active-farm:' + userId);
  if (!farmId || farmId === 'local-farm') return false;
  const claimedOwner = legacyOwnerForMigration();
  if (claimedOwner && claimedOwner !== userId) return false;

  const marker = await idbGet<{ farmId?: string }>(legacyMigrationKey(userId));
  if (marker) return false;

  const legacy = await idbGet<LocalLedger>(LEGACY_KEY);
  // Farm identity must match exactly. The user must still explicitly confirm
  // that this browser's legacy records belong to their account.
  return legacy?.farm?.id === farmId;
}

export async function recoverLegacyLedgerForCurrentUser(): Promise<LocalLedger> {
  if (typeof window === 'undefined') throw new Error('Offline ledger recovery is only available in the browser.');

  const { data } = await createBrowserClientApp().auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error('Sign in before recovering offline records.');

  const farmId = window.localStorage.getItem('pig-ledger-active-farm:' + userId);
  if (!farmId || farmId === 'local-farm') {
    throw new Error('Select the farm that originally owned these offline records before recovering them.');
  }

  const legacy = await idbGet<LocalLedger>(LEGACY_KEY);
  if (!legacy || legacy.farm?.id !== farmId) {
    throw new Error('The old offline ledger does not match the selected farm. It has been left untouched.');
  }

  const existingMarker = legacyOwnerForMigration();
  if (existingMarker && existingMarker !== userId) {
    throw new Error('The old offline ledger was already claimed by another account. It has been left untouched.');
  }

  // This claim is written only after an explicit user action in Settings.
  window.localStorage.setItem(LEGACY_OWNER_KEY, userId);
  await migrateLegacyLedgerOnce(userId, farmId, userId);
  return loadLocalLedger();
}

export async function loadLocalLedger(): Promise<LocalLedger> {
  const key = await scopedKey();
  const saved = await idbGet(key);
  if (saved && typeof saved === 'object') {
      return {
        farm: saved.farm ?? defaultFarm(),
        batches: Array.isArray(saved.batches) ? saved.batches : [],
        expenses: Array.isArray(saved.expenses) ? saved.expenses : [],
        sales: Array.isArray(saved.sales) ? saved.sales : [],
        populationMovements: Array.isArray(saved.populationMovements) ? saved.populationMovements : [],
        feedProducts: Array.isArray(saved.feedProducts) ? saved.feedProducts : [],
        feedInventoryMovements: Array.isArray(saved.feedInventoryMovements) ? saved.feedInventoryMovements : [],
        feedConsumption: Array.isArray(saved.feedConsumption) ? saved.feedConsumption : [],
        weightRecords: Array.isArray(saved.weightRecords) ? saved.weightRecords : [],
        healthRecords: Array.isArray(saved.healthRecords) ? saved.healthRecords : [],
        customers: Array.isArray(saved.customers) ? saved.customers : [],
        suppliers: Array.isArray(saved.suppliers) ? saved.suppliers : [],
        salePayments: Array.isArray(saved.salePayments) ? saved.salePayments : [],
        pending: Array.isArray(saved.pending) ? saved.pending : [],
        syncError: typeof saved.syncError === 'string' ? saved.syncError : null,
        operationsSchemaReady: saved.operationsSchemaReady === true,
        monitoringSchemaReady: saved.monitoringSchemaReady === true,
        businessSchemaReady: saved.businessSchemaReady === true,
        updatedAt: saved.updatedAt ?? new Date().toISOString()
      };
  }
  return defaultLedger();
}

export function setActiveFarmScope(farmId: string): void {
  if (typeof window === 'undefined') return;
  const userId = window.localStorage.getItem(OWNER_KEY);
  if (!userId || !farmId) return;
  window.localStorage.setItem('pig-ledger-active-farm:' + userId, farmId);
}

export async function saveLocalLedger(ledger: LocalLedger): Promise<void> {
  const key = await scopedKey();
  await idbSet(ledger, key);
}

export async function replaceLocalWithServer(
  farm: Farm,
  expenses: Expense[],
  sales: Sale[],
  batches: Batch[] = [],
  operations?: {
    populationMovements: PopulationMovement[];
    feedProducts: FeedProduct[];
    feedInventoryMovements: FeedInventoryMovement[];
    feedConsumption: FeedConsumptionRecord[];
    weightRecords: WeightRecord[];
    healthRecords: HealthRecord[];
    schemaReady: boolean;
    monitoringSchemaReady: boolean;
    customers: Customer[];
    suppliers: Supplier[];
    salePayments: SalePayment[];
    businessSchemaReady: boolean;
  }
): Promise<LocalLedger> {
  let local = await loadLocalLedger();
  if (local.farm.id !== 'local-farm' && local.farm.id !== farm.id) {
    setActiveFarmScope(farm.id);
    local = await loadLocalLedger();
  }
  const pendingBatchRecords = local.pending
    .filter((op) => op.kind === 'add-batch' || op.kind === 'update-batch')
    .map((op) => ({ key: op.batch.id, record: op.batch }));
  const pendingExpenseOps = local.pending.filter((op) => op.kind === 'add-expense' || op.kind === 'update-expense');
  const pendingSaleOps = local.pending.filter((op) => op.kind === 'add-sale' || op.kind === 'update-sale');
  const deletedExpenseOps = local.pending.filter((op) => op.kind === 'delete-expense');
  const deletedSaleOps = local.pending.filter((op) => op.kind === 'delete-sale');
  const stableKey = (id: string) => id.startsWith('local-') ? deterministicUuid(`pig-ledger:${id}`) : Promise.resolve(id);

  const [pendingExpenseRecords, pendingSaleRecords, deletedExpenseIds, deletedSaleIds] = await Promise.all([
    Promise.all(pendingExpenseOps.map(async (op) => ({ key: await stableKey(op.expense.id), record: op.expense }))),
    Promise.all(pendingSaleOps.map(async (op) => ({ key: await stableKey(op.sale.id), record: op.sale }))),
    Promise.all(deletedExpenseOps.map((op) => stableKey(op.id))),
    Promise.all(deletedSaleOps.map((op) => stableKey(op.id)))
  ]);

  const mergedBatches = mergeServerRecordsWithPending(batches, pendingBatchRecords);
  const mergedExpenses = mergeServerRecordsWithPending(expenses, pendingExpenseRecords, deletedExpenseIds);
  const mergedSales = mergeServerRecordsWithPending(sales, pendingSaleRecords, deletedSaleIds);
  setActiveFarmScope(farm.id);
  const next: LocalLedger = {
    farm,
    batches: mergedBatches,
    expenses: mergedExpenses,
    sales: mergedSales,
    populationMovements: mergeById(local.populationMovements ?? [], operations?.populationMovements ?? []),
    feedProducts: mergeById(local.feedProducts ?? [], operations?.feedProducts ?? []),
    feedInventoryMovements: mergeById(local.feedInventoryMovements ?? [], operations?.feedInventoryMovements ?? []),
    feedConsumption: mergeById(local.feedConsumption ?? [], operations?.feedConsumption ?? []),
    weightRecords: mergeById(local.weightRecords ?? [], operations?.weightRecords ?? []),
    healthRecords: mergeById(local.healthRecords ?? [], operations?.healthRecords ?? []),
    customers: mergeById(local.customers ?? [], operations?.customers ?? []),
    suppliers: mergeById(local.suppliers ?? [], operations?.suppliers ?? []),
    salePayments: mergeById(local.salePayments ?? [], operations?.salePayments ?? []),
    businessSchemaReady: operations?.businessSchemaReady ?? local.businessSchemaReady ?? false,
    operationsSchemaReady: operations?.schemaReady ?? local.operationsSchemaReady ?? false,
    monitoringSchemaReady: operations?.monitoringSchemaReady ?? local.monitoringSchemaReady ?? false,
    pending: local.pending,
    syncError: local.syncError ?? null,
    updatedAt: new Date().toISOString()
  };
  await saveLocalLedger(next);
  return next;
}

export function makeLocalId(prefix: string): string {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of local) merged.set(item.id, item);
  for (const item of remote) merged.set(item.id, item);
  return [...merged.values()];
}
