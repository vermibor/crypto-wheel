'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { DashboardData } from './types';

interface DashboardState {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
}

const DashboardContext = createContext<DashboardState>({
  data: null,
  loading: true,
  error: null,
});

/** Prepend the configured basePath to a relative URL */
function withBasePath(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  return `${base}${path}`;
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DashboardState>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const url = withBasePath('/data/dashboard.json');
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch dashboard data: ${res.status} ${res.statusText}`);
        const json: DashboardData = await res.json();
        if (!cancelled) {
          setState({ data: json, loading: false, error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : 'Unknown error loading dashboard data',
          });
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <DashboardContext.Provider value={state}>
      {children}
    </DashboardContext.Provider>
  );
}

/**
 * Access dashboard data from any client component.
 * Returns { data, loading, error }.
 */
export function useDashboard(): DashboardState {
  return useContext(DashboardContext);
}
