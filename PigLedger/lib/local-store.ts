import type { Batch, Expense, Farm, Sale } from './types';

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
  updatedAt: string;
};

const DB_NAME = 'pig-ledger-db';
const STORE = 'ledger';
const KEY = 'ledger-v1';

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

async function idbGet(): Promise<LocalLedger | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
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

async function idbSet(ledger: LocalLedger): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ ...ledger, updatedAt: new Date().toISOString() }, KEY);
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
  try {
    const saved = await idbGet();
    if (saved && typeof saved === 'object') {
      return {
        farm: saved.farm ?? defaultFarm(),
        batches: Array.isArray(saved.batches) ? saved.batches.filter((batch) => batch.status !== 'archived') : [],
        expenses: Array.isArray(saved.expenses) ? saved.expenses : [],
        sales: Array.isArray(saved.sales) ? saved.sales : [],
        pending: Array.isArray(saved.pending) ? saved.pending : [],
        updatedAt: saved.updatedAt ?? new Date().toISOString()
      };
    }
  } catch {
    // IndexedDB can be unavailable in private browsing modes.
  }
  return defaultLedger();
}

export async function saveLocalLedger(ledger: LocalLedger): Promise<void> {
  try {
    await idbSet(ledger);
  } catch {
    // Keep the current session usable even if local persistence is unavailable.
  }
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
  const next: LocalLedger = {
    farm,
    batches: mergedBatches,
    expenses: mergedExpenses,
    sales: mergedSales,
    pending: local.pending,
    updatedAt: new Date().toISOString()
  };
  await saveLocalLedger(next);
  return next;
}

export function makeLocalId(prefix: string): string {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
