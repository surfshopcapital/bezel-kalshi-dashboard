'use client';
import { useQuery } from '@tanstack/react-query';

export function useMarketDetail(ticker: string) {
  return useQuery({
    queryKey: ['market', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/kalshi/market/${encodeURIComponent(ticker)}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
    enabled: Boolean(ticker),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
