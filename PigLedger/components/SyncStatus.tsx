'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/Icon';
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
      <div className="flex items-start justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
        <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Offline — entries are stored on this device
          {pending > 0 ? ` (${pending} pending)` : ''} and synchronize when connectivity returns.
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={doSync}
      className={
        'flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition ' +
        (pending > 0
          ? 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100')
      }
    >
      <Icon name={syncing || pending > 0 ? 'sync' : 'check'} className="h-4 w-4" />
      {syncing
        ? 'Synchronizing…'
        : pending > 0
          ? `Online — ${pending} entr${pending > 1 ? 'ies' : 'y'} pending synchronization`
          : `Online — all records synchronized${lastSync ? ' · ' + lastSync : ''}`}
    </button>
  );
}
