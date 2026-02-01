"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

type RouteTransitionApi = {
  readonly isExiting: boolean;
  readonly navigate: (href: string) => void;
};

const RouteTransitionContext = createContext<RouteTransitionApi | null>(null);

export function RouteTransitionProvider(props: { readonly children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? '';

  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<number | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    // Once navigation completes, allow the next view to fade in.
    setIsExiting(false);
    busyRef.current = false;
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const api = useMemo<RouteTransitionApi>(() => {
    return {
      isExiting,
      navigate: (href: string) => {
        if (!href) return;
        if (busyRef.current) return;
        if (href === pathname) return;

        busyRef.current = true;
        setIsExiting(true);

        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          router.push(href);
        }, 180);
      }
    };
  }, [isExiting, pathname, router]);

  return <RouteTransitionContext.Provider value={api}>{props.children}</RouteTransitionContext.Provider>;
}

export function useRouteTransition(): RouteTransitionApi {
  const ctx = useContext(RouteTransitionContext);
  if (!ctx) throw new Error('useRouteTransition must be used within RouteTransitionProvider');
  return ctx;
}

