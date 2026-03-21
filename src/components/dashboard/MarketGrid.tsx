'use client';
import { MarketCard, type MarketCardProps } from './MarketCard';
import { LoadingCard } from '@/components/shared/LoadingCard';

interface MarketGridProps {
  markets: MarketCardProps[];
  isLoading?: boolean;
}

const SKELETON_COUNT = 6;

export function MarketGrid({ markets, isLoading = false }: MarketGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
          <LoadingCard key={i} />
        ))}
      </div>
    );
  }

  if (!markets || markets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-slate-700 bg-slate-800 py-16 text-center">
        <div className="mb-3 rounded-full bg-slate-700 p-4">
          <svg
            className="h-8 w-8 text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <p className="text-base font-medium text-slate-300">No markets found</p>
        <p className="mt-1 text-sm text-slate-500">
          Try refreshing the data or check back later.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {markets.map((market) => (
        <MarketCard key={market.ticker} {...market} />
      ))}
    </div>
  );
}
