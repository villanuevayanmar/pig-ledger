import type { Batch, Expense, Farm, Sale } from './types';
import { createBrowserClientApp } from './supabase/client';

export type PendingOp =
  | { kind: 'add-expense'; expense: Expense }
  | { kind: 'delete-expense'; id: string }
  | { kind: 'add-sale'; sale: Sale }
  | { kind: 'delete-sale'; id: string }
  | { kind: 'add-batch'; batch: Batch }
  | { kind: 'update-batch'; batch: Batch }
  | { kind: 'update-farm'; farm: Farm };

export type LocalLedger = {
  farm: Farm;
  batches: Batch[];
  expenses: Expense[];
  sales: Sale[];
  pending: PendingOp[];
  syncError?: string | null;
  updatedAt: string;
};

const DB_NAME = 'pig-ledger-db';
const STORE = 'ledger';
const LEGACY_KEY = 'ledger-v1';
const OWNER_KEY = 'pig-ledger-owner';

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
  const existing = await idbGet(key);
  if (!existing) {
    const lastOwner = typeof window !== 'undefined' ? window.localStorage.getItem(OWNER_KEY) : null;
    if (lastOwner === userId) {
      const legacy = await idbGet(LEGACY_KEY);
      if (legacy) await idbSet(legacy, key);
    }
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
    pending: [],
    syncError: null,
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

async function idbGet(key: string): Promise<LocalLedger | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as LocalLedger) ?? null);
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

export async function loadLocalLedger(): Promise<LocalLedger> {
  const key = await scopedKey();
  const saved = await idbGet(key);
  if (saved && typeof saved === 'object') {
      return {
        farm: saved.farm ?? defaultFarm(),
        batches: Array.isArray(saved.batches) ? saved.batches.filter((batch) => batch.status !== 'archived') : [],
        expenses: Array.isArray(saved.expenses) ? saved.expenses : [],
        sales: Array.isArray(saved.sales) ? saved.sales : [],
        pending: Array.isArray(saved.pending) ? saved.pending : [],
        syncError: typeof saved.syncError === 'string' ? saved.syncError : null,
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
  batches: Batch[] = []
): Promise<LocalLedger> {
  const local = await loadLocalLedger();
  const pendingBatches = local.pending
    .filter((op) => op.kind === 'add-batch' || op.kind === 'update-batch')
    .map((op) => op.batch);
  const pendingExpenseIds = new Set(
    local.pending.filter((op) => op.kind === 'add-expense').map((op) => op.expense.id)
  );
  const pendingSaleIds = new Set(
    local.pending.filter((op) => op.kind === 'add-sale').map((op) => op.sale.id)
  );
  const mergedBatches = batches
    .filter((batch) => batch.status !== 'archived')
    .map((batch) => pendingBatches.find((item) => item.id === batch.id) ?? batch);
  for (const batch of pendingBatches) {
    if (batch.status !== 'archived' && !mergedBatches.some((item) => item.id === batch.id)) mergedBatches.unshift(batch);
  }
  const mergedExpenses = [...expenses];
  for (const expense of local.expenses) {
    if (pendingExpenseIds.has(expense.id) && !mergedExpenses.some((item) => item.id === expense.id)) mergedExpenses.unshift(expense);
  }
  const mergedSales = [...sales];
  for (const sale of local.sales) {
    if (pendingSaleIds.has(sale.id) && !mergedSales.some((item) => item.id === sale.id)) mergedSales.unshift(sale);
  }
  setActiveFarmScope(farm.id);
  const next: LocalLedger = {
    farm,
    batches: mergedBatches,
    expenses: mergedExpenses,
    sales: mergedSales,
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
