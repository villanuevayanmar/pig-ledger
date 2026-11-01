'use client';

import { useCallback, useEffect, useState } from 'react';
import SyncStatus from '@/components/SyncStatus';
import LoadError from '@/components/LoadError';
import Icon from '@/components/Icon';
import ExportImport from '@/components/ExportImport';
import { computeTotals } from '@/lib/totals';
import { num } from '@/lib/format';
import {
  hasRecoverableLegacyLedger,
  loadLocalLedger,
  recoverLegacyLedgerForCurrentUser,
  saveLocalLedger,
  type LocalLedger
} from '@/lib/local-store';
import { syncLedgerNow } from '@/components/ExpensesClient';

export default function SettingsClient() {
  const [ledger, setLedger] = useState<LocalLedger | null>(null);
  const [loadError, setLoadError] = useState('');
  const [legacyRecoveryAvailable, setLegacyRecoveryAvailable] = useState(false);
  const [recoveringLegacy, setRecoveringLegacy] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');

  const loadSettings = useCallback(async () => {
    setLoadError('');
    try {
      setLedger(await syncLedgerNow());
      setLegacyRecoveryAvailable(await hasRecoverableLegacyLedger());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load farm settings.');
    }
  }, []);

  async function handleLegacyRecovery() {
    const accepted = window.confirm(
      'Recover the old offline records for this selected farm? Continue only if you recognize these records and they belong to your account. Existing server records will not be deleted.'
    );
    if (!accepted) return;

    setRecoveringLegacy(true);
    setRecoveryMessage('');
    try {
      const restored = await recoverLegacyLedgerForCurrentUser();
      setLedger(restored);
      setLegacyRecoveryAvailable(false);
      setRecoveryMessage('Previous offline records were recovered. They remain pending until synchronization completes.');
    } catch (error) {
      setRecoveryMessage(error instanceof Error ? error.message : 'Could not recover the previous offline ledger.');
    } finally {
      setRecoveringLegacy(false);
    }
  }

  useEffect(() => { void loadSettings(); }, [loadSettings]);

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
    return loadError
      ? <LoadError message={loadError} onRetry={() => { void loadSettings(); }} />
      : <div className="card text-center"><p className="muted">Loading…</p></div>;
  }

  return (
    <div className="space-y-4">
      <SyncStatus pending={ledger.pending.length} syncError={ledger.syncError} onSync={async () => { setLedger(await syncLedgerNow()); }} />

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

      {legacyRecoveryAvailable ? (
        <section className="card space-y-3 border border-amber-200" aria-labelledby="legacy-recovery-title">
          <div>
            <h3 id="legacy-recovery-title" className="font-semibold text-slate-900">Previous offline records found</h3>
            <p className="mt-1 text-sm text-slate-600">
              This browser contains an older offline ledger for the selected farm. It was not imported automatically to avoid mixing records between accounts. Recover it only when you recognize the records and know they belong to your account.
            </p>
          </div>
          <button type="button" className="btn-secondary w-full" onClick={handleLegacyRecovery} disabled={recoveringLegacy}>
            {recoveringLegacy ? 'Recovering records…' : 'Recover previous offline records'}
          </button>
          {recoveryMessage ? <p className="text-sm text-slate-700" role="status">{recoveryMessage}</p> : null}
        </section>
      ) : null}

      <div>
        <h3 className="section-title">Backup and Restore</h3>
        <p className="section-sub">Download a copy or safely merge a previous backup.</p>
      </div>
      <ExportImport
        farm={ledger.farm}
        expenses={ledger.expenses}
        sales={ledger.sales}
        totals={computeTotals(ledger.expenses, ledger.sales, ledger.farm.pigCount)}
      />
    </div>
  );
}
