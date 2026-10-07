import type { Metadata, Viewport } from 'next';
import './globals.css';
import Nav from '@/components/Nav';
import { supabaseConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Pig Farm Ledger',
  description: 'Simple piggery accounting — feed expenses, sales and profit tracking.'
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
            <span className="text-3xl" aria-hidden>
              🐷
            </span>
            <div>
              <h1 className="text-lg font-bold leading-tight text-emerald-700">Pig Farm Ledger</h1>
              <p className="text-xs text-slate-500">Feed expenses · Sales · Profit</p>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl px-4 pb-32 pt-4">{children}</main>

        {supabaseConfigured ? <Nav /> : null}
      </body>
    </html>
  );
}
