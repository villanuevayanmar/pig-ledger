'use client';

import { useEffect, useState } from 'react';
import SyncStatus from '@/components/SyncStatus';
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
    alert('Saved on this phone. Will sync when online. 🟢');
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

      <h2 className="section-title">⚙️ Settings</h2>

      <form action={handleFarm} className="card space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">My farm</h3>
        <label className="block">
          <span className="label">Farm / batch name</span>
          <input type="text" name="name" className="input" defaultValue={ledger.farm.name} placeholder="e.g. Backyard Farm - Batch 1" required />
        </label>
        <label className="block">
          <span className="label">Number of pigs</span>
          <input type="number" name="pigCount" className="input" inputMode="numeric" min="0" step="1" defaultValue={ledger.farm.pigCount || ''} placeholder="e.g. 12" />
        </label>
        <p className="muted">
          Used to compute <strong>Profit per Pig = Profit ÷ number of pigs</strong>. Works offline.
        </p>
        <button type="submit" className="btn-green w-full">💾 Save farm info</button>
      </form>

      <details className="card">
        <summary className="cursor-pointer text-sm font-bold text-emerald-700">
          ❓ How offline mode works
        </summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
          <li>No signal? Add expenses/sales anyway — they save on this phone instantly.</li>
          <li>Unsynced rows show <strong>⏳ not synced</strong>.</li>
          <li>When internet returns, tap the green <strong>🟢 Online</strong> pill to send them to Supabase.</li>
          <li>Download a JSON backup every week from the old Settings page.</li>
        </ol>
      </details>
    </div>
  );
}
