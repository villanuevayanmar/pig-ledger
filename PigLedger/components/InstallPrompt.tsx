'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

/**
 * "Install app" banner — only shows when the browser allows it.
 * On iPhone: Share  Add to Home Screen (Apple gives no prompt event).
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem('pigledger-install-dismissed') === '1') setDismissed(true);
    } catch {
      // ignore
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (dismissed || !deferred) return null;

  async function install() {
    try {
      await deferred?.prompt();
    } finally {
      setDeferred(null);
    }
  }

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem('pigledger-install-dismissed', '1');
    } catch {
      // ignore
    }
  }

  return (
    <div className="card flex items-center gap-3 border-sky-200 bg-sky-50">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
        <Icon name="download" className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">Install Pig Farm Ledger</p>
        <p className="muted text-xs">Add to home screen — launches like an application and works offline.</p>
      </div>
      <button type="button" onClick={install} className="btn-primary px-4 py-2 text-sm">
        Install
      </button>
      <button type="button" onClick={dismiss} className="px-2 py-2 text-xs font-semibold text-slate-500" aria-label="Dismiss">
        Dismiss
      </button>
    </div>
  );
}
