'use client';
import { useQuery } from '@tanstack/react-query';

export function useBezelHistory(slug: string, limit = 90) {
  return useQuery({
    queryKey: ['bezelHistory', slug, limit],
    queryFn: async () => {
      const res = await fetch(
        `/api/bezel/entity/${encodeURIComponent(slug)}/history?limit=${limit}`,
      );
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
    enabled: Boolean(slug),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
