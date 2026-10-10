import type { Metadata, Viewport } from 'next';
import './globals.css';
import Nav from '@/components/Nav';
import UserMenu from '@/components/UserMenu';
import InstallPrompt from '@/components/InstallPrompt';
import SwRegister from '@/components/SwRegister';
import Icon from '@/components/Icon';
import { createClient, supabaseConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Pig Farm Ledger | Piggery Accounting',
  description: 'Piggery accounting — operating expenses, revenue, and net profit tracking.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'PigLedger' },
  icons: [{ rel: 'icon', url: '/icons/icon-512.svg' }]
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Display-only session read; middleware performs the actual protection.
  let email: string | null = null;
  if (supabaseConfigured) {
    try {
      const { data } = await createClient().auth.getSession();
      email = data.session?.user.email ?? null;
    } catch {
      email = null;
    }
  }

  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Icon name="building" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-base font-bold leading-tight tracking-tight text-slate-900">
                  Pig Farm Ledger
                </h1>
                <p className="text-xs font-medium text-slate-500">
                  Piggery Accounting System
                </p>
              </div>
            </div>
            <UserMenu email={email} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-32 pt-4">
          <SwRegister />
          <InstallPrompt />
          {children}
        </main>

        {supabaseConfigured ? <Nav /> : null}
      </body>
    </html>
  );
}
