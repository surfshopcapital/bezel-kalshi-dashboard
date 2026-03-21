'use client';
import { useQuery } from '@tanstack/react-query';

export function useCorrelations(lookback = 30) {
  return useQuery({
    queryKey: ['correlations', lookback],
    queryFn: async () => {
      const res = await fetch(`/api/correlations?lookback=${lookback}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
}
