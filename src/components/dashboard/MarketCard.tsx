'use client';
import Link from 'next/link';
import { ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Sparkline } from '@/components/shared/Sparkline';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { StaleDataWarning } from '@/components/shared/StaleDataWarning';
import { LoadingCard } from '@/components/shared/LoadingCard';
import {
  formatCurrency,
  formatDaysRemaining,
} from '@/lib/utils/formatters';

export interface MarketCardProps {
  ticker: string;
  title: string;
  kalshiUrl: string;
  bezelUrl: string | null;
  brand: string | null;
  status: string;
  expirationDate: string | null;
  yesBid: number | null;
  yesAsk: number | null;
  yesPrice: number | null;
  noPrice: number | null;
  volume: number | null;
  impliedProb: number | null;
  currentBezelPrice: number | null;
  bezelDailyChange: number | null;
  bezelDailyChangePct: number | null;
  strikeValue: number | null;
  strikeDirection: 'above' | 'below' | null;
  distanceToStrike: number | null;
  distanceToStrikeSigmas: number | null;
  modeledProbability: number | null;
  modelEdge: number | null;
  bezelPriceHistory: number[];
  dataSourceQuality: string | null;
  lastBezelUpdate: string | null;
  bezelDataAt: string | null;
  isLoading?: boolean;
}

// Brand colors for visual differentiation
const BRAND_COLORS: Record<string, string> = {
  Rolex: 'bg-green-700 text-green-100',
  'Patek Philippe': 'bg-blue-700 text-blue-100',
  'Audemars Piguet': 'bg-purple-700 text-purple-100',
  'Richard Mille': 'bg-red-700 text-red-100',
  Omega: 'bg-sky-700 text-sky-100',
  'A. Lange & Söhne': 'bg-amber-700 text-amber-100',
  Cartier: 'bg-rose-700 text-rose-100',
  IWC: 'bg-cyan-700 text-cyan-100',
  Breitling: 'bg-orange-700 text-orange-100',
};

function brandColorClass(brand: string | null): string {
  if (!brand) return 'bg-slate-700 text-slate-300';
  return BRAND_COLORS[brand] ?? 'bg-slate-600 text-slate-200';
}

function formatVolume(value: number | null): string {
  if (value == null) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatCents(value: number | null): string {
  if (value == null) return '—';
  return `${Math.round(value)}¢`;
}

function formatProb(value: number | null): string {
  if (value == null) return '—';
  return `${Number(value).toFixed(1)}%`;
}

function ProbBar({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number | null;
  colorClass: string;
}) {
  const pct = value ?? 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-xs text-slate-400 font-medium">{label}</span>
      <div className="relative flex-1 h-2.5 rounded-full bg-slate-700 overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${colorClass} transition-all duration-300`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-mono font-medium text-slate-300">
        {formatProb(value)}
      </span>
    </div>
  );
}

export function MarketCard(props: MarketCardProps) {
  if (props.isLoading) return <LoadingCard />;

  const {
    ticker,
    title,
    kalshiUrl,
    bezelUrl,
    brand,
    expirationDate,
    yesBid,
    yesAsk,
    yesPrice,
    noPrice,
    volume,
    impliedProb,
    currentBezelPrice,
    bezelDailyChange,
    bezelDailyChangePct,
    strikeValue,
    strikeDirection,
    distanceToStrike,
    distanceToStrikeSigmas,
    modeledProbability,
    modelEdge,
    bezelPriceHistory,
    dataSourceQuality,
    lastBezelUpdate,
    bezelDataAt,
  } = props;

  const daysRemaining = formatDaysRemaining(expirationDate);
  const hasEdge = modelEdge != null && Math.abs(modelEdge) > 5;
  const edgePositive = (modelEdge ?? 0) >= 0;

  // "Updated Today" badge: true when Bezel's computed-price date matches today
  const bezelUpdatedToday =
    bezelDataAt != null &&
    new Date(bezelDataAt).toDateString() === new Date().toDateString();

  // Determine bezel price change color
  const changeIsPositive = (bezelDailyChange ?? 0) > 0;
  const changeIsNegative = (bezelDailyChange ?? 0) < 0;
  const sparklineColor = changeIsPositive ? '#22c55e' : changeIsNegative ? '#ef4444' : '#94a3b8';

  const truncatedTitle = title.length > 56 ? title.slice(0, 55) + '…' : title;

  return (
    <Link
      href={`/markets/${encodeURIComponent(ticker)}`}
      className="block rounded-lg border border-slate-700 bg-slate-800 p-4 hover:border-slate-500 hover:bg-slate-750 transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {brand && (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${brandColorClass(brand)}`}
            >
              {brand}
            </span>
          )}
          <span
            className="text-sm font-medium text-slate-200 leading-tight truncate"
            title={title}
          >
            {truncatedTitle}
          </span>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-mono font-medium ${
            daysRemaining === 'Expired'
              ? 'bg-red-900/50 text-red-400'
              : 'bg-slate-700 text-slate-300'
          }`}
        >
          {daysRemaining}
        </span>
      </div>

      {/* ── Row 1: Kalshi bid/ask + volume ──────────────────────── */}
      <div className="flex items-center gap-3 mb-2.5">
        <span className="font-mono text-sm font-semibold text-green-400">
          BID {formatCents(yesBid ?? yesPrice)}
        </span>
        <span className="font-mono text-sm font-semibold text-amber-400">
          ASK {formatCents(yesAsk ?? (noPrice != null ? 100 - noPrice : null))}
        </span>
        <span className="font-mono text-xs text-slate-500">
          MID {formatCents(yesPrice)}
        </span>
        <span className="font-mono text-xs text-slate-400 ml-auto">
          Vol: {formatVolume(volume)}
        </span>
      </div>

      {/* ── Row 2: Bezel price + change + sparkline ─────────────── */}
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-slate-100">
              {currentBezelPrice != null ? formatCurrency(currentBezelPrice) : '—'}
            </span>
            {bezelUpdatedToday && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/40 border border-emerald-700/50 px-2 py-0.5 text-xs font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Updated Today
              </span>
            )}
          </div>
          {bezelDailyChange != null && (
            <div className="flex items-center gap-1 mt-0.5">
              {changeIsPositive && <TrendingUp className="h-3 w-3 text-green-400" />}
              {changeIsNegative && <TrendingDown className="h-3 w-3 text-red-400" />}
              {!changeIsPositive && !changeIsNegative && (
                <Minus className="h-3 w-3 text-slate-400" />
              )}
              <span
                className={`text-xs font-mono font-medium ${
                  changeIsPositive
                    ? 'text-green-400'
                    : changeIsNegative
                    ? 'text-red-400'
                    : 'text-slate-400'
                }`}
              >
                {changeIsPositive ? '+' : ''}
                {formatCurrency(bezelDailyChange)}
                {bezelDailyChangePct != null && (
                  <span className="ml-1 opacity-80">
                    ({changeIsPositive ? '+' : ''}
                    {bezelDailyChangePct.toFixed(2)}%)
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
        <div className="w-32 shrink-0">
          <Sparkline data={bezelPriceHistory} color={sparklineColor} height={40} />
        </div>
      </div>

      {/* ── Row 3: Strike info ──────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-2.5 text-xs">
        <span className="text-slate-400">
          Strike:{' '}
          <span className="font-mono font-medium text-slate-200">
            {strikeValue != null ? formatCurrency(strikeValue) : '—'}
          </span>
          {strikeDirection && (
            <span className="ml-1 text-slate-500">({strikeDirection})</span>
          )}
        </span>
        {distanceToStrike != null && (
          <span className="text-slate-500 font-mono">
            {distanceToStrike >= 0 ? '+' : ''}
            {formatCurrency(distanceToStrike)}
          </span>
        )}
        {distanceToStrikeSigmas != null && (
          <span
            className={`font-mono font-medium ${
              Math.abs(distanceToStrikeSigmas) < 1
                ? 'text-amber-400'
                : Math.abs(distanceToStrikeSigmas) < 2
                ? 'text-yellow-400'
                : 'text-slate-400'
            }`}
          >
            {distanceToStrikeSigmas >= 0 ? '+' : ''}
            {distanceToStrikeSigmas.toFixed(2)}σ
          </span>
        )}
      </div>

      {/* ── Row 4: Probability comparison bars ──────────────────── */}
      <div className="space-y-1.5 mb-3">
        <ProbBar label="Model" value={modeledProbability} colorClass="bg-blue-500" />
        <ProbBar label="Kalshi" value={impliedProb} colorClass="bg-slate-500" />
        {hasEdge && (
          <div
            className={`flex items-center gap-1.5 text-xs font-medium ${
              edgePositive ? 'text-amber-400' : 'text-orange-400'
            }`}
          >
            <span>Edge:</span>
            <span className="font-mono">
              {edgePositive ? '+' : ''}
              {modelEdge!.toFixed(1)}%
            </span>
            <span className="text-amber-500/70">
              ({edgePositive ? 'model favors YES' : 'model favors NO'})
            </span>
          </div>
        )}
      </div>

      {/* ── Footer: links + source badge + stale warning ────────── */}
      <div
        className="flex items-center justify-between pt-2.5 border-t border-slate-700/70"
        onClick={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-2">
          <a
            href={kalshiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-blue-400 transition-colors"
            title="View on Kalshi"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          {bezelUrl && (
            <a
              href={bezelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-green-400 transition-colors"
              title="View on Bezel"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          <SourceBadge quality={dataSourceQuality} />
          {bezelDataAt && (
            <span
              className="text-xs text-slate-500"
              title={`Bezel data computed at ${new Date(bezelDataAt).toLocaleString()}`}
            >
              Bezel {new Date(bezelDataAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <StaleDataWarning lastUpdated={lastBezelUpdate} maxAgeMinutes={60} />
      </div>
    </Link>
  );
}
