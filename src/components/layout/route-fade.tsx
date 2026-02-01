"use client";

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import { useRouteTransition } from '@/components/layout/route-transition-provider';

export function RouteFade(props: { readonly children: React.ReactNode }) {
  const pathname = usePathname();
  const { isExiting } = useRouteTransition();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Fade in on new route mount/update.
    setVisible(false);
    const id = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, [pathname]);

  useEffect(() => {
    if (isExiting) setVisible(false);
  }, [isExiting]);

  return (
    <div
      className={['transition-opacity duration-200 ease-out', visible ? 'opacity-100' : 'opacity-0'].join(' ')}
    >
      {props.children}
    </div>
  );
}

