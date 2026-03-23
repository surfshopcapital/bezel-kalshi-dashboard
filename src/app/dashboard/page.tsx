'use client';

import { useMarkets } from '@/hooks/useMarkets';
import { useBezelUpdates } from '@/hooks/useBezelUpdates';
import { MarketGrid } from '@/components/dashboard/MarketGrid';
import { StatsBar } from '@/components/dashboard/StatsBar';
import { BezelUpdateTable } from '@/components/dashboard/BezelUpdateTable';
import { ErrorDisplay } from '@/components/shared/ErrorDisplay';
import type { DashboardMarketCard } from '@/types';
import type { MarketCardProps } from '@/components/dashboard/MarketCard';

/** Map a DashboardMarketCard (API shape) to MarketCardProps (UI component shape). */
function toCardProps(card: DashboardMarketCard): MarketCardProps {
  return {
    ticker: card.ticker,
    title: card.title,
    kalshiUrl: card.kalshiUrl,
    bezelUrl: card.bezelUrl,
    brand: card.brand,
    status: card.status,
    expirationDate: card.expirationDate,
    yesBid: card.yesBid,
    yesAsk: card.yesAsk,
    yesPrice: card.yesPrice,
    noPrice: card.noPrice,
    volume: card.volume,
    impliedProb: card.impliedProb,
    currentBezelPrice: card.currentBezelPrice,
    bezelDailyChange: card.bezelDailyChange,
    bezelDailyChangePct: card.bezelDailyChangePct,
    strikeValue: card.strikeValue,
    strikeDirection: card.strikeDirection,
    distanceToStrike: card.distanceToStrike,
    distanceToStrikeSigmas: card.distanceToStrikeSigmas,
    modeledProbability: card.modeledProbability,
    modelEdge: card.modelEdge,
    confidenceScore: card.confidenceScore,
    bezelPriceHistory: card.bezelPriceHistory,
    dataSourceQuality: card.dataSourceQuality,
    lastBezelUpdate: card.lastBezelUpdate,
    bezelDataAt: card.bezelDataAt,
  };
}

export default function DashboardPage() {
  const { data, isLoading, error } = useMarkets();
  const { data: bezelUpdates, isLoading: updatesLoading } = useBezelUpdates();

  const cards: DashboardMarketCard[] = data?.data ?? [];
  const cardProps: MarketCardProps[] = cards.map(toCardProps);

  // Summary stats for the StatsBar
  const marketsAboveStrike = cards.filter(
    (c) =>
      c.strikeDirection === 'above' &&
      c.currentBezelPrice != null &&
      c.strikeValue != null &&
      c.currentBezelPrice > c.strikeValue,
  ).length;

  const edgeValues = cards
    .map((c) => c.modelEdge)
    .filter((e): e is number => e != null);
  const avgModelEdge =
    edgeValues.length > 0
      ? edgeValues.reduce((sum, e) => sum + e, 0) / edgeValues.length
      : null;

  const lastRefresh = data?.meta?.timestamp
    ? new Date(data.meta.timestamp)
    : null;

  if (error) {
    return (
      <ErrorDisplay
        message={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">
            Watch Market Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Kalshi prediction markets tracked against Bezel luxury watch price
            indices. Modeled probabilities updated hourly.
          </p>
        </div>

        {/* Refresh badge */}
        {!isLoading && cards.length > 0 && (
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-green-900/30 px-3 py-1 text-xs font-medium text-green-400 border border-green-700/40">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            Live
          </span>
        )}
      </div>

      {/* Summary stats row */}
      <StatsBar
        totalMarkets={isLoading ? 0 : cards.length}
        marketsAboveStrike={marketsAboveStrike}
        avgModelEdge={avgModelEdge}
        lastRefresh={lastRefresh}
      />

      {/* Market cards grid */}
      <MarketGrid markets={cardProps} isLoading={isLoading} />

      {/* Bezel daily update log table */}
      <BezelUpdateTable
        rows={bezelUpdates?.data ?? []}
        isLoading={updatesLoading}
      />
    </div>
  );
}
