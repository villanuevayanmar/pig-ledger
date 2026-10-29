'use client';

import { useEffect, useState } from 'react';
import SyncStatus from '@/components/SyncStatus';
import Icon from '@/components/Icon';
import { num } from '@/lib/format';
import {
  loadLocalLedger,
  saveLocalLedger,
  type LocalLedger
} from '@/lib/local-store';
import { syncLedgerNow } from '@/components/ExpensesClient';

export default function SettingsClient() {
  const [ledger, setLedger] = useState<LocalLedger | null>(null);

  useEffect(() => {
    loadLocalLedger().then(setLedger);
    syncLedgerNow().then(setLedger).catch(() => {});
  }, []);

  async function handleFarm(formData: FormData) {
    const local = await loadLocalLedger();
    local.farm = {
      ...local.farm,
      name: String(formData.get('name') || 'My Piggery').trim() || 'My Piggery',
      pigCount: Math.max(0, Math.round(num(formData.get('pigCount'))))
    };
    local.pending = [...local.pending, { kind: 'update-farm', farm: local.farm }];
    await saveLocalLedger(local);
    setLedger({ ...local });
    alert('Farm profile saved on this device. It will synchronize when connectivity returns.');
    syncLedgerNow().then(setLedger).catch(() => {});
  }

  if (!ledger) {
    return (
      <div className="card text-center">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SyncStatus pending={ledger.pending.length} onSync={async () => { setLedger(await syncLedgerNow()); }} />

      <div>
        <h2 className="section-title">Settings</h2>
        <p className="section-sub">Farm profile and offline data</p>
      </div>

      <form action={handleFarm} className="card space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Farm Profile</h3>
        <label className="block">
          <span className="label">Farm / Batch Name</span>
          <input type="text" name="name" className="input" defaultValue={ledger.farm.name} placeholder="e.g. Backyard Farm - Batch 1" required />
        </label>
        <label className="block">
          <span className="label">Herd Size (Head Count)</span>
          <input type="number" name="pigCount" className="input" inputMode="numeric" min="0" step="1" defaultValue={ledger.farm.pigCount || ''} placeholder="e.g. 12" />
        </label>
        <p className="muted">
          Used to calculate <strong>Net Profit per Head = Net Profit ÷ Herd Size</strong>. Works
          offline.
        </p>
        <button type="submit" className="btn-primary w-full">
          <Icon name="check" className="h-4 w-4" />
          Save Farm Profile
        </button>
      </form>

      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">
          How offline mode works
        </summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
          <li>Without a network connection, expense and sales entries are stored on this device immediately.</li>
          <li>Unsynchronized records are labelled <strong>Pending sync</strong>.</li>
          <li>When connectivity returns, select the status indicator to transmit records to Supabase.</li>
          <li>Download a JSON backup every week from the Settings page.</li>
        </ol>
      </details>
    </div>
  );
}
