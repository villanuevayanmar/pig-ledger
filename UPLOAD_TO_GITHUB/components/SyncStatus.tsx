'use client';

import { useCallback, useEffect, useState } from 'react';
import { isBrowserOnline } from '@/lib/supabase/client';

export type SyncState = {
  online: boolean;
  syncing: boolean;
  pending: number;
  lastSync: string | null;
};

/**
 * Online/offline pill + pending count.
 * Parent passes pending count + a sync function; this handles
 * the online/offline events and the auto-sync on reconnect.
 */
export default function SyncStatus({
  pending,
  onSync
}: {
  pending: number;
  onSync: () => Promise<void>;
}) {
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const doSync = useCallback(async () => {
    if (syncing) return;
    if (!isBrowserOnline()) return;
    setSyncing(true);
    try {
      await onSync();
      setLastSync(new Date().toLocaleTimeString());
    } finally {
      setSyncing(false);
    }
  }, [onSync, syncing]);

  useEffect(() => {
    setOnline(isBrowserOnline());
    const goOnline = () => {
      setOnline(true);
      doSync();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [doSync]);

  // Auto-sync once when the page loads with pending items.
  useEffect(() => {
    if (pending > 0 && isBrowserOnline()) doSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!online) {
    return (
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-800">
        🟠 Offline — entries save on this phone
        {pending > 0 ? ` (${pending} will sync)` : ''}. They will send when internet returns.
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={doSync}
      className={
        'block w-full rounded-2xl border px-4 py-2 text-center text-sm font-bold ' +
        (pending > 0
          ? 'border-sky-300 bg-sky-50 text-sky-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700')
      }
    >
      {syncing
        ? '🔄 Syncing…'
        : pending > 0
          ? `🟢 Online — tap to sync ${pending} entr${pending > 1 ? 'ies' : 'y'}`
          : `🟢 Online — all synced${lastSync ? ' · ' + lastSync : ''}`}
    </button>
  );
}
