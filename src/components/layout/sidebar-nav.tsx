"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useRouteTransition } from '@/components/layout/route-transition-provider';

type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly description?: string;
  readonly match?: 'exact' | 'startsWith';
};

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', label: 'You', description: 'All about you...', match: 'exact' },
  { href: '/dashboard/reminders', label: 'Now', description: 'Set reminders...', match: 'startsWith' },
  { href: '/dashboard/baby', label: 'Them', description: 'More for your baby...', match: 'startsWith' }
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match === 'startsWith') {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  return pathname === item.href;
}

export function SidebarNav() {
  const pathname = usePathname();
  const { navigate } = useRouteTransition();

  return (
    <aside className="rounded-2xl border border-zinc-900 bg-zinc-950/60 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Routes</div>
      <nav className="mt-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname ?? '', item);
          return (
            <Link
              key={item.href}
              className={`block rounded-xl px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-zinc-800/60 text-zinc-50'
                  : 'text-zinc-200 hover:bg-zinc-900/40 hover:text-zinc-50'
              }`}
              href={item.href}
              onClick={(e) => {
                e.preventDefault();
                navigate(item.href);
              }}
            >
              <div className="font-medium">{item.label}</div>
              {item.description ? (
                <div className="text-xs text-zinc-500">{item.description}</div>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

