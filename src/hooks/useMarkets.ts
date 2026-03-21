'use client';
import { useQuery } from '@tanstack/react-query';

export function useMarkets() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
