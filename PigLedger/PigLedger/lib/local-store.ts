// ============================================================
// Offline-first layer for Pig Farm Ledger.
// Phone keeps its own copy (IndexedDB) so the app works with NO signal.
// When internet returns, queued rows sync to Supabase.
// Last-write-wins: a synced row simply exists in both places.
// ============================================================
import type { Expense, Farm, Sale } from './types';

export type PendingOp =
  | { kind: 'add-expense'; expense: Expense }
  | { kind: 'delete-expense'; id: string }
  | { kind: 'add-sale'; sale: Sale }
  | { kind: 'delete-sale'; id: string }
  | { kind: 'update-farm'; farm: Farm };

export type LocalLedger = {
  farm: Farm;
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
  return { farm: defaultFarm(), expenses: [], sales: [], pending: [], updatedAt: new Date().toISOString() };
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

/** Load local copy (offline-safe). Falls back to defaults when empty. */
export async function loadLocalLedger(): Promise<LocalLedger> {
  try {
    const saved = await idbGet();
    if (saved && typeof saved === 'object') {
      return {
        farm: saved.farm ?? defaultFarm(),
        expenses: Array.isArray(saved.expenses) ? saved.expenses : [],
        sales: Array.isArray(saved.sales) ? saved.sales : [],
        pending: Array.isArray(saved.pending) ? saved.pending : [],
        updatedAt: saved.updatedAt ?? new Date().toISOString()
      };
    }
  } catch {
    // IndexedDB unavailable (private mode etc.) — use memory only.
  }
  return defaultLedger();
}

export async function saveLocalLedger(ledger: LocalLedger): Promise<void> {
  try {
    await idbSet(ledger);
  } catch {
    // Ignore — app still works in memory for this session.
  }
}

/** Replace local rows with the server (online) copy, keeping unsynced queue. */
export async function replaceLocalWithServer(
  farm: Farm,
  expenses: Expense[],
  sales: Sale[]
): Promise<LocalLedger> {
  const local = await loadLocalLedger();
  const next: LocalLedger = { farm, expenses, sales, pending: local.pending, updatedAt: new Date().toISOString() };
  await saveLocalLedger(next);
  return next;
}

export function makeLocalId(prefix: string): string {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
