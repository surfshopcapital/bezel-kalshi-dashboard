'use client';
import { useQuery } from '@tanstack/react-query';

export interface BezelUpdateRow {
  slug: string;
  name: string;
  price: number;
  dailyChange: number | null;
  dailyChangePct: number | null;
  bezelComputedAt: string | null; // ISO — when Bezel computed the price
  capturedAt: string | null;      // ISO — when we first detected the new price
}

async function fetchBezelUpdates(): Promise<{ data: BezelUpdateRow[]; meta: { timestamp: string } }> {
  const res = await fetch('/api/dashboard/bezel-updates');
  if (!res.ok) throw new Error('Failed to fetch Bezel update log');
  return res.json();
}

export function useBezelUpdates() {
  return useQuery({
    queryKey: ['bezel-updates'],
    queryFn: fetchBezelUpdates,
    refetchInterval: 5 * 60 * 1000, // re-fetch every 5 min
    staleTime: 4 * 60 * 1000,
  });
}
