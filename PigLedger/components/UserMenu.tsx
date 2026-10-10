'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { createBrowserClientApp } from '@/lib/supabase/client';

/**
 * Header account area: subtle email badge + formal Log Out button.
 * Hidden on the /login page.
 */
export default function UserMenu({ email }: { email: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  if (!email || pathname === '/login') return null;

  async function handleSignOut() {
    if (busy) return;
    setBusy(true);
    try {
      await createBrowserClientApp().auth.signOut();
    } catch {
      // Offline — local session is cleared regardless; middleware
      // will treat the next request as unauthenticated once verified.
    }
    router.push('/login');
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600"
        title={email}
      >
        <Icon name="user" className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-[96px] truncate sm:max-w-[200px]">{email}</span>
      </span>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
      >
        <Icon name="logout" className="h-3.5 w-3.5" />
        {busy ? 'Signing Out…' : 'Log Out'}
      </button>
    </div>
  );
}
