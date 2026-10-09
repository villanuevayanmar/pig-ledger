'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/expenses', label: 'Expenses', icon: '💸' },
  { href: '/sales', label: 'Sales', icon: '💰' },
  { href: '/settings', label: 'Settings', icon: '⚙️' }
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
      aria-label="Main menu"
    >
      <div className="mx-auto grid w-full max-w-3xl grid-cols-4">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={
                'flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-xs font-semibold transition ' +
                (active ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600')
              }
            >
              <span className="text-xl" aria-hidden>
                {tab.icon}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
