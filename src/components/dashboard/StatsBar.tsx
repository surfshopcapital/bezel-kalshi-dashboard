'use client';
import { Activity, TrendingUp, BarChart2, Clock } from 'lucide-react';
import { formatDate } from '@/lib/utils/formatters';

interface StatsBarProps {
  totalMarkets: number;
  marketsAboveStrike: number;
  avgModelEdge: number | null;
  lastRefresh: Date | string | null;
}

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ReactNode;
  highlight?: boolean;
  highlightColor?: string;
}

function StatCard({
  label,
  value,
  subValue,
  icon,
  highlight = false,
  highlightColor = 'text-blue-400',
}: StatCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 flex-1 min-w-0">
      <div className="shrink-0 rounded-md bg-slate-700 p-2 text-slate-400">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide truncate">
          {label}
        </p>
        <p className={`text-lg font-bold font-mono leading-tight ${highlight ? highlightColor : 'text-slate-100'}`}>
          {value}
        </p>
        {subValue && <p className="text-xs text-slate-500 truncate">{subValue}</p>}
      </div>
    </div>
  );
}

export function StatsBar({
  totalMarkets,
  marketsAboveStrike,
  avgModelEdge,
  lastRefresh,
}: StatsBarProps) {
  const abovePct =
    totalMarkets > 0 ? ((marketsAboveStrike / totalMarkets) * 100).toFixed(0) : '0';

  const edgeFormatted =
    avgModelEdge != null
      ? `${avgModelEdge >= 0 ? '+' : ''}${avgModelEdge.toFixed(1)}%`
      : '—';

  const edgeHighlight =
    avgModelEdge != null && Math.abs(avgModelEdge) > 3;

  const lastRefreshStr = lastRefresh ? formatDate(lastRefresh, 'relative') : 'Never';

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
      <StatCard
        label="Total Markets"
        value={String(totalMarkets)}
        icon={<Activity className="h-4 w-4" />}
        subValue="tracked Kalshi contracts"
      />
      <StatCard
        label="Above Strike"
        value={`${marketsAboveStrike}`}
        subValue={`${abovePct}% of markets`}
        icon={<TrendingUp className="h-4 w-4" />}
        highlight={marketsAboveStrike > 0}
        highlightColor="text-green-400"
      />
      <StatCard
        label="Avg Model Edge"
        value={edgeFormatted}
        subValue="model vs. Kalshi implied"
        icon={<BarChart2 className="h-4 w-4" />}
        highlight={edgeHighlight}
        highlightColor={
          (avgModelEdge ?? 0) >= 0 ? 'text-amber-400' : 'text-orange-400'
        }
      />
      <StatCard
        label="Last Refresh"
        value={lastRefreshStr}
        icon={<Clock className="h-4 w-4" />}
        subValue="auto-refreshes every 60s"
      />
    </div>
  );
}
