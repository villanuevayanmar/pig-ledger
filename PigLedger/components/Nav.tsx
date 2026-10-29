'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/Icon';

const TABS = [
  { href: '/', label: 'Overview', icon: 'home' as const },
  { href: '/transactions', label: 'Transactions', icon: 'expenses' as const },
  { href: '/batches', label: 'Batches', icon: 'building' as const },
  { href: '/reports', label: 'Reports', icon: 'sales' as const },
  { href: '/settings', label: 'Settings', icon: 'settings' as const }
];

export default function Nav() {
  const pathname = usePathname();
  if (pathname === '/login') return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_2px_rgba(15,23,42,0.04)]"
      aria-label="Main navigation"
    >
      <div className="mx-auto grid w-full max-w-3xl grid-cols-5">
        {TABS.map((tab) => {
          const active = tab.href === '/'
            ? pathname === '/'
            : tab.href === '/transactions'
              ? ['/transactions', '/expenses', '/sales'].includes(pathname)
              : tab.href === '/batches'
                ? ['/batches', '/fattening'].includes(pathname)
                : pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={
                'flex min-h-[56px] flex-col items-center justify-center gap-1 border-t-2 text-[10px] font-semibold uppercase tracking-wide transition sm:text-[11px] ' +
                (active
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-600')
              }
            >
              <Icon name={tab.icon} className="h-5 w-5" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
