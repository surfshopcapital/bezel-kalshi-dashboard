import useSWR from 'swr';

export interface BezelUpdateRow {
  slug: string;
  name: string;
  price: number;
  dailyChange: number | null;
  dailyChangePct: number | null;
  bezelComputedAt: string | null; // ISO — when Bezel computed the price
  capturedAt: string | null;      // ISO — when we first detected the new price
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useBezelUpdates() {
  return useSWR<{ data: BezelUpdateRow[]; meta: { timestamp: string } }>(
    '/api/dashboard/bezel-updates',
    fetcher,
    { refreshInterval: 5 * 60 * 1000 }, // re-fetch every 5 min
  );
}
