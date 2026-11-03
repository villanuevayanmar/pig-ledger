'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/Icon';

const TABS = [
  { href: '/', label: 'Overview', icon: 'home' as const },
  { href: '/transactions', label: 'Transactions', mobileLabel: 'Ledger', icon: 'expenses' as const },
  { href: '/batches', label: 'Batches', icon: 'building' as const },
  { href: '/operations', label: 'Farm', icon: 'activity' as const },
  { href: '/business', label: 'Business', icon: 'briefcase' as const },
  { href: '/reports', label: 'Reports', icon: 'sales' as const },
  { href: '/settings', label: 'Settings', icon: 'settings' as const }
];

const MORE_TABS = [
  { href: '/expenses', label: 'Expenses', icon: 'expenses' as const },
  { href: '/sales', label: 'Sales', icon: 'sales' as const },
  { href: '/fattening', label: 'Fattening', icon: 'building' as const },
  { href: '/monitoring', label: 'Monitoring', icon: 'activity' as const },
  { href: '/business', label: 'Business', icon: 'briefcase' as const },
  { href: '/reports', label: 'Reports', icon: 'sales' as const },
  { href: '/settings', label: 'Settings', icon: 'settings' as const }
];

function isMoreRoute(pathname: string) {
  return MORE_TABS.some((tab) => pathname === tab.href || pathname.startsWith(tab.href + '/'));
}

function isDesktopTabActive(href: string, pathname: string) {
  if (href === '/') return pathname === '/';
  if (href === '/transactions') return ['/transactions', '/expenses', '/sales'].includes(pathname);
  if (href === '/batches') return ['/batches', '/fattening'].includes(pathname);
  if (href === '/operations') return ['/operations', '/monitoring'].includes(pathname);
  return pathname === href || pathname.startsWith(href + '/');
}

export default function Nav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMoreOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moreOpen]);

  if (pathname === '/login') return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_2px_rgba(15,23,42,0.04)]"
      aria-label="Main navigation"
    >
      {/* Phone layout: four primary destinations plus a roomy More menu. */}
      <div className="relative mx-auto grid min-h-[60px] w-full max-w-3xl grid-cols-5 md:hidden">
        {TABS.slice(0, 4).map((tab) => {
          const active = tab.href === '/'
            ? pathname === '/'
            : tab.href === '/transactions'
              ? pathname === '/transactions'
              : tab.href === '/batches'
                ? pathname === '/batches'
                : pathname === '/operations';
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={
                'flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-1 border-t-2 px-1 text-[10px] font-semibold tracking-tight transition ' +
                (active
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700')
              }
            >
              <Icon name={tab.icon} className="h-5 w-5 shrink-0" />
              <span className="w-full truncate text-center">{tab.mobileLabel ?? tab.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls="mobile-more-navigation"
          onClick={() => setMoreOpen((open) => !open)}
          className={
            'flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-1 border-t-2 px-1 text-[10px] font-semibold tracking-tight transition ' +
            (moreOpen || isMoreRoute(pathname)
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700')
          }
        >
          <Icon name="more" className="h-5 w-5 shrink-0" />
          <span>More</span>
        </button>

        {moreOpen ? (
          <div
            id="mobile-more-navigation"
            className="absolute bottom-[calc(100%+0.5rem)] right-2 z-50 max-h-[min(70vh,32rem)] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
            role="group"
            aria-label="More navigation options"
          >
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              More sections
            </p>
            <div className="grid grid-cols-2 gap-2">
              {MORE_TABS.map((tab) => {
                const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setMoreOpen(false)}
                    className={
                      'flex min-h-[48px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ' +
                      (active
                        ? 'border-slate-300 bg-slate-100 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')
                    }
                  >
                    <Icon name={tab.icon} className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">{tab.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* Larger screens keep the familiar full navigation bar. */}
      <div className="mx-auto hidden w-full max-w-3xl grid-cols-7 md:grid">
        {TABS.map((tab) => {
          const active = isDesktopTabActive(tab.href, pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={
                'flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-1 border-t-2 px-1 text-[10px] font-semibold uppercase tracking-wide transition ' +
                (active
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-600')
              }
            >
              <Icon name={tab.icon} className="h-5 w-5" />
              <span className="w-full truncate text-center">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
