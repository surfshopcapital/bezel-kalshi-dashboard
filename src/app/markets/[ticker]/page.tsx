'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, ArrowLeft, RefreshCw } from 'lucide-react';
import { useMarketDetail } from '@/hooks/useMarketDetail';
import { useBezelHistory } from '@/hooks/useBezelHistory';
import { useCorrelations } from '@/hooks/useCorrelations';
import { BezelHistoryChart } from '@/components/market/BezelHistoryChart';
import { OrderbookLadder } from '@/components/market/OrderbookLadder';
import { ProbabilityPanel } from '@/components/market/ProbabilityPanel';
import { IngestionLogs } from '@/components/market/IngestionLogs';
import { CorrelationHeatmap } from '@/components/research/CorrelationHeatmap';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { StaleDataWarning } from '@/components/shared/StaleDataWarning';
import { ErrorDisplay } from '@/components/shared/ErrorDisplay';
import { LoadingCard } from '@/components/shared/LoadingCard';
import { formatCurrency, formatDate, formatDaysRemaining } from '@/lib/utils/formatters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'overview' | 'history' | 'orderbook' | 'probability' | 'correlations' | 'logs';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'history', label: 'Bezel History' },
  { id: 'orderbook', label: 'Orderbook' },
  { id: 'probability', label: 'Probability' },
  { id: 'correlations', label: 'Correlations' },
  { id: 'logs', label: 'Data Logs' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  className = 'text-slate-100',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        {label}
      </span>
      <span className={`font-mono text-sm font-semibold ${className}`}>
        {value}
      </span>
    </div>
  );
}

function TabButton({
  id,
  label,
  active,
  onClick,
}: {
  id: Tab;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
        active
          ? 'bg-slate-700 text-slate-100'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MarketDetailPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = use(params);
  const upperTicker = ticker.toUpperCase();
  const [tab, setTab] = useState<Tab>('overview');
  const [corrLookback, setCorrLookback] = useState(30);

  const {
    data: marketData,
    isLoading,
    error,
    refetch,
  } = useMarketDetail(upperTicker);

  const detail = marketData?.data;
  const bezelSlug = detail?.mapping?.bezelSlug ?? null;

  const { data: bezelHistoryData, isLoading: historyLoading } = useBezelHistory(
    bezelSlug ?? '',
    90,
  );
  const { data: corrData, isLoading: corrLoading } = useCorrelations(corrLookback);

  // ── Loading / error states ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 rounded-md bg-slate-800 animate-pulse" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <LoadingCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorDisplay
        message={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-xl font-semibold text-slate-300">Market not found</p>
        <p className="mt-2 text-sm text-slate-500">
          Ticker <span className="font-mono">{upperTicker}</span> is not in the
          database yet. Run the Kalshi ingestion job to seed it.
        </p>
        <Link
          href="/dashboard"
          className="mt-4 text-sm text-blue-400 hover:text-blue-300 underline"
        >
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const { market, snapshot, orderbook, probability, mapping, logs } = detail;

  // ── Bezel history data ─────────────────────────────────────────────────────

  const bezelHistory: { date: string; price: number; change?: number }[] = (
    bezelHistoryData?.data ?? []
  ).map((p: { date: string; price: number; change: number | null }) => ({
    date: p.date,
    price: p.price,
    ...(p.change != null ? { change: p.change } : {}),
  }));

  // ── Probability panel data ─────────────────────────────────────────────────

  const latestBezelPrice =
    bezelHistory.length > 0
      ? bezelHistory[bezelHistory.length - 1].price
      : null;

  const strikeValue = mapping?.strikeValue ?? market.resolvedStrike ?? null;
  const strikeDirection = (mapping?.strikeDirection ??
    market.strikeDirection ??
    null) as 'above' | 'below' | null;

  let distanceToStrike: number | null = null;
  let distanceToStrikeSigmas: number | null = null;
  if (probability) {
    distanceToStrike = probability.currentLevel - probability.strike;
    distanceToStrikeSigmas =
      probability.oneSigmaMove > 0
        ? distanceToStrike / probability.oneSigmaMove
        : null;
  } else if (latestBezelPrice != null && strikeValue != null) {
    distanceToStrike = latestBezelPrice - strikeValue;
  }

  const modeledProbability =
    probability != null
      ? (strikeDirection === 'above'
          ? probability.probabilityAbove
          : probability.probabilityBelow) * 100
      : null;

  const probPanelData = {
    currentPrice: latestBezelPrice ?? probability?.currentLevel ?? null,
    strikeValue,
    strikeDirection,
    daysRemaining: probability?.daysToExpiry ?? null,
    expirationDate: market.expirationDate,
    distanceToStrike,
    distanceToStrikeSigmas,
    modeledProbability,
    impliedProbability: snapshot ? snapshot.impliedProb * 100 : null,
    modelEdge: probability?.modelEdge != null ? probability.modelEdge * 100 : null,
    annualizedVol: probability?.annualizedVol ?? null,
    scenarios: Array.isArray(probability?.scenarioTable)
      ? (probability!.scenarioTable as {
          volAssumption: number;
          probAbove: number;
          probBelow: number;
          oneSigmaMove: number;
        }[])
      : undefined,
    percentiles: Array.isArray(probability?.percentileBands)
      ? (probability!.percentileBands as {
          percentile: number;
          price: number;
        }[])
      : undefined,
    computedAt: probability?.runAt ?? null,
  };

  // ── Orderbook data ─────────────────────────────────────────────────────────

  const yesBids = Array.isArray(orderbook?.yesBids)
    ? (orderbook!.yesBids as { price: number; quantity: number }[])
    : [];
  const noBids = Array.isArray(orderbook?.noBids)
    ? (orderbook!.noBids as { price: number; quantity: number }[])
    : [];

  // ── Correlations data ──────────────────────────────────────────────────────

  const corrMatrix = corrData?.data;
  const corrMatrixFilled = corrMatrix
    ? corrMatrix.matrix.map((row: (number | null)[]) =>
        row.map((v) => (v ?? 0)),
      )
    : [];

  // ── Header info ────────────────────────────────────────────────────────────

  const daysRemaining = formatDaysRemaining(market.expirationDate);

  return (
    <div className="space-y-5">
      {/* Breadcrumb + back link */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 hover:text-slate-300 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Dashboard
        </Link>
        <span>/</span>
        <span className="font-mono text-slate-400">{upperTicker}</span>
      </div>

      {/* Market header card */}
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Left: title + meta */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              {mapping?.brand && (
                <span className="rounded-full bg-slate-700 px-2.5 py-0.5 text-xs font-semibold text-slate-200">
                  {mapping.brand}
                </span>
              )}
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-mono font-medium ${
                  market.status === 'open'
                    ? 'bg-green-900/50 text-green-400'
                    : 'bg-slate-700 text-slate-400'
                }`}
              >
                {market.status}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-mono font-medium ${
                  daysRemaining === 'Expired'
                    ? 'bg-red-900/50 text-red-400'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {daysRemaining}
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-100 leading-snug">
              {market.title}
            </h1>
            {market.subtitle && (
              <p className="mt-0.5 text-sm text-slate-400">{market.subtitle}</p>
            )}
            <p className="mt-1 font-mono text-xs text-slate-500">
              {upperTicker}
              {market.eventTicker && ` · ${market.eventTicker}`}
            </p>
          </div>

          {/* Right: action links + stale warning */}
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <a
                href={market.kalshiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-600 hover:text-slate-100 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Kalshi
              </a>
              {mapping?.bezelUrl && (
                <a
                  href={mapping.bezelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-600 hover:text-slate-100 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Bezel
                </a>
              )}
              <button
                onClick={() => refetch()}
                className="rounded-md border border-slate-600 bg-slate-700 p-1.5 text-slate-400 hover:bg-slate-600 hover:text-slate-200 transition-colors"
                title="Refresh data"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            {snapshot && (
              <StaleDataWarning lastUpdated={snapshot.capturedAt} maxAgeMinutes={30} />
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-700 pt-4 sm:grid-cols-4 lg:grid-cols-6">
          <Stat
            label="YES Price"
            value={snapshot ? `${Math.round(snapshot.yesPrice)}¢` : '—'}
            className="text-green-400"
          />
          <Stat
            label="NO Price"
            value={snapshot ? `${Math.round(snapshot.noPrice)}¢` : '—'}
            className="text-red-400"
          />
          <Stat
            label="Volume"
            value={
              snapshot
                ? snapshot.volume >= 1_000_000
                  ? `$${(snapshot.volume / 1_000_000).toFixed(1)}M`
                  : snapshot.volume >= 1_000
                  ? `$${(snapshot.volume / 1_000).toFixed(1)}K`
                  : `$${snapshot.volume}`
                : '—'
            }
          />
          <Stat
            label="Kalshi Implied"
            value={snapshot ? `${(snapshot.impliedProb * 100).toFixed(1)}%` : '—'}
          />
          <Stat
            label="Bezel Price"
            value={latestBezelPrice != null ? formatCurrency(latestBezelPrice) : '—'}
            className="text-blue-400"
          />
          <Stat
            label="Strike"
            value={strikeValue != null ? formatCurrency(strikeValue) : '—'}
            className="text-amber-400"
          />
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-700 pb-0">
        {TABS.map((t) => (
          <TabButton
            key={t.id}
            id={t.id}
            label={t.label}
            active={tab === t.id}
            onClick={() => setTab(t.id)}
          />
        ))}
      </div>

      {/* Tab content */}
      <div>
        {/* ── Overview tab ────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Bezel history mini chart */}
            <div>
              <BezelHistoryChart
                history={bezelHistory}
                strike={strikeValue ?? undefined}
                entityName={mapping?.bezelSlug ?? upperTicker}
              />
            </div>

            {/* Probability summary */}
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-200">
                Probability Summary
              </h3>
              {probability ? (
                <ProbabilityPanel probRun={probPanelData} />
              ) : (
                <div className="flex items-center justify-center py-8 text-sm text-slate-500">
                  No probability model run yet. Check back after the next
                  scheduled computation.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Bezel History tab ────────────────────────────────────── */}
        {tab === 'history' && (
          <div className="space-y-4">
            {historyLoading ? (
              <LoadingCard />
            ) : (
              <BezelHistoryChart
                history={bezelHistory}
                strike={strikeValue ?? undefined}
                entityName={mapping?.bezelSlug ?? upperTicker}
              />
            )}
            <div className="flex items-center gap-3 text-xs text-slate-500">
              {mapping?.bezelEntityType && (
                <span>
                  Type:{' '}
                  <span className="font-medium text-slate-400 capitalize">
                    {mapping.bezelEntityType}
                  </span>
                </span>
              )}
              {bezelHistoryData?.meta?.count != null && (
                <span>{bezelHistoryData.meta.count} data points</span>
              )}
            </div>
          </div>
        )}

        {/* ── Orderbook tab ────────────────────────────────────────── */}
        {tab === 'orderbook' && (
          <div>
            {orderbook ? (
              <OrderbookLadder
                yesBids={yesBids}
                noBids={noBids}
                bestYesBid={orderbook.bestYesBid}
                bestNoBid={orderbook.bestNoBid}
                spread={orderbook.spread}
                midpoint={orderbook.midpoint}
                lastUpdated={orderbook.capturedAt}
              />
            ) : (
              <div className="flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 py-12 text-sm text-slate-500">
                No orderbook data available yet.
              </div>
            )}
          </div>
        )}

        {/* ── Probability tab ─────────────────────────────────────── */}
        {tab === 'probability' && (
          <div>
            {probability ? (
              <ProbabilityPanel probRun={probPanelData} />
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border border-slate-700 bg-slate-800 py-16 text-center">
                <p className="text-base font-medium text-slate-300">
                  No model output yet
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  The probability engine needs at least 5 historical Bezel price
                  points and a valid strike to run.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Correlations tab ────────────────────────────────────── */}
        {tab === 'correlations' && (
          <div className="space-y-4">
            {/* Lookback selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Lookback:</span>
              {[7, 14, 30, 60, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setCorrLookback(d)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    corrLookback === d
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>

            {corrLoading ? (
              <LoadingCard />
            ) : corrMatrix && corrMatrix.ids.length > 0 ? (
              <CorrelationHeatmap
                ids={corrMatrix.ids}
                names={corrMatrix.names}
                matrix={corrMatrixFilled}
              />
            ) : (
              <div className="flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 py-12 text-sm text-slate-500">
                No correlation data available yet.
              </div>
            )}

            {corrMatrix?.computedAt && (
              <p className="text-xs text-slate-600">
                Computed {formatDate(corrMatrix.computedAt, 'relative')}
              </p>
            )}
          </div>
        )}

        {/* ── Data Logs tab ────────────────────────────────────────── */}
        {tab === 'logs' && (
          <div>
            {logs && logs.length > 0 ? (
              <IngestionLogs logs={logs} />
            ) : (
              <div className="flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 py-12 text-sm text-slate-500">
                No ingestion logs found for this market.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
