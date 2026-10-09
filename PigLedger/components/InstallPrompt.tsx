'use client';

import { useEffect, useState } from 'react';

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

/**
 * "Install app" banner — only shows when the browser allows it.
 * On iPhone: Share → Add to Home Screen (Apple gives no prompt event).
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
    <div className="card flex items-center gap-3 border-emerald-200 bg-emerald-50">
      <span className="text-2xl" aria-hidden>📲</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-emerald-800">Install Pig Farm Ledger</p>
        <p className="muted text-xs">Add to home screen — opens like an app, works offline.</p>
      </div>
      <button type="button" onClick={install} className="btn-green px-4 py-2 text-sm">
        Install
      </button>
      <button type="button" onClick={dismiss} className="px-2 py-2 text-slate-400" aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
