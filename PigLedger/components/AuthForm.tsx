'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { createBrowserClientApp } from '@/lib/supabase/client';
import { defaultLedger, saveLocalLedger } from '@/lib/local-store';

const OWNER_KEY = 'pig-ledger-owner';

type Mode = 'signin' | 'signup';
type Notice = { tone: 'error' | 'ok'; text: string } | null;

/** Keep only internal redirect targets (prevents open redirects). */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/login')) return raw;
  return '/';
}

/**
 * This device keeps an offline copy of the ledger. When a DIFFERENT
 * account signs in on the same device, the previous account's cached
 * records are cleared so records never leak between users.
 */
async function claimLocalCopy(userId: string): Promise<void> {
  try {
    const last = window.localStorage.getItem(OWNER_KEY);
    if (last && last !== userId) await saveLocalLedger(defaultLedger());
    window.localStorage.setItem(OWNER_KEY, userId);
  } catch {
    // Storage unavailable — continue without switching.
  }
}

/**
 * Email + Password authentication (Supabase). Formal, minimal,
 * matches the enterprise slate theme. No emojis.
 */
export default function AuthForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const target = safeNext(next);

  async function handleSubmit(formData: FormData) {
    const email = String(formData.get('email') || '').trim().toLowerCase();
    const password = String(formData.get('password') || '');

    if (!email || !password) {
      setNotice({ tone: 'error', text: 'Enter your email address and password to continue.' });
      return;
    }

    setBusy(true);
    setNotice(null);
    const sb = createBrowserClientApp();

    try {
      if (mode === 'signin') {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) {
          setNotice({
            tone: 'error',
            text:
              error.message === 'Invalid login credentials'
                ? 'Email address or password is incorrect.'
                : error.message
          });
          return;
        }
        if (data.user) await claimLocalCopy(data.user.id);
        setNotice({ tone: 'ok', text: 'Signed in. Opening your ledger…' });
        router.push(target);
        router.refresh();
      } else {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) {
          setNotice({ tone: 'error', text: error.message });
          return;
        }
        if (data.session && data.user) {
          // Email confirmation is disabled — session issued immediately.
          await claimLocalCopy(data.user.id);
          setNotice({ tone: 'ok', text: 'Account created. Opening your ledger…' });
          router.push(target);
          router.refresh();
        } else {
          // Email confirmation required by the Supabase project.
          setNotice({
            tone: 'ok',
            text: 'Account created. Confirm your email address, then sign in.'
          });
          setMode('signin');
        }
      }
    } catch {
      setNotice({
        tone: 'error',
        text: 'Could not reach the authentication service. Check your connection and try again.'
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md pt-6">
      <div className="card space-y-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Icon name="building" className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Pig Farm Ledger</h1>
            <p className="text-xs font-medium text-slate-500">Piggery Accounting System</p>
          </div>
        </div>

        <div className="grid grid-cols-2 rounded-lg bg-slate-200/70 p-1 text-sm font-semibold">
          {(['signin', 'signup'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setNotice(null);
              }}
              className={
                'rounded-md px-3 py-2 transition ' +
                (mode === m
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700')
              }
            >
              {m === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        {notice ? (
          <div
            className={
              'flex items-start gap-2 rounded-lg border px-4 py-3 text-sm font-semibold ' +
              (notice.tone === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700')
            }
            role="status"
          >
            <Icon
              name={notice.tone === 'error' ? 'alert' : 'check'}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>{notice.text}</span>
          </div>
        ) : null}

        <form action={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="label">Email Address</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="farmer@example.com"
              className="input"
              required
            />
          </label>

          <label className="block">
            <span className="label">Password</span>
            <input
              type="password"
              name="password"
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              placeholder="Minimum 6 characters"
              className="input"
              required
            />
          </label>

          <button type="submit" disabled={busy} className="btn-primary w-full">
            <Icon name="lock" className="h-4 w-4" />
            {busy
              ? mode === 'signin'
                ? 'Signing In…'
                : 'Creating Account…'
              : mode === 'signin'
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </form>

        <p className="muted border-t border-slate-200 pt-4">
          Access is restricted to authorized accounts. Every expense and sale record is stored
          against your account and is visible only to you.
        </p>
      </div>
    </div>
  );
}
