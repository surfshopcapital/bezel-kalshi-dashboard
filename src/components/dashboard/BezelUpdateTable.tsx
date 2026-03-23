'use client';

import { Clock, CheckCircle, Hourglass } from 'lucide-react';
import type { BezelUpdateRow } from '@/hooks/useBezelUpdates';
import { formatCurrency } from '@/lib/utils/formatters';

interface BezelUpdateTableProps {
  rows: BezelUpdateRow[];
  isLoading?: boolean;
}

function formatUpdateTime(iso: string | null): { label: string; isToday: boolean } {
  if (!iso) return { label: 'No data yet', isToday: false };
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return {
    label: isToday ? `Today ${timeStr}` : `${dateStr} ${timeStr}`,
    isToday,
  };
}

export function BezelUpdateTable({ rows, isLoading }: BezelUpdateTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 animate-pulse">
        <div className="h-4 w-48 bg-slate-700 rounded mb-4" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-slate-700/50 rounded mb-2" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
        <Clock className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-200">Bezel Daily Price Update Log</h2>
        <span className="ml-auto text-xs text-slate-500">
          Polled every 15 min · Updated when Bezel publishes new daily value
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/60">
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Market</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Current Price</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Daily Chg</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Bezel Computed At</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">We Detected At</th>
              <th className="text-center px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const computed = formatUpdateTime(row.bezelComputedAt);
              const detected = formatUpdateTime(row.capturedAt);
              const changePos = (row.dailyChange ?? 0) > 0;
              const changeNeg = (row.dailyChange ?? 0) < 0;

              return (
                <tr
                  key={row.slug}
                  className="border-b border-slate-700/40 hover:bg-slate-700/20 transition-colors"
                >
                  {/* Market name */}
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-200 text-xs leading-tight">
                      {row.name}
                    </span>
                  </td>

                  {/* Price */}
                  <td className="px-4 py-3 text-right font-mono text-slate-100 font-semibold">
                    {row.price > 0 ? formatCurrency(row.price) : '—'}
                  </td>

                  {/* Daily change */}
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {row.dailyChange != null ? (
                      <span className={changePos ? 'text-green-400' : changeNeg ? 'text-red-400' : 'text-slate-400'}>
                        {changePos ? '+' : ''}{formatCurrency(row.dailyChange)}
                        {row.dailyChangePct != null && (
                          <span className="ml-1 opacity-75">
                            ({changePos ? '+' : ''}{row.dailyChangePct.toFixed(2)}%)
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>

                  {/* Bezel computed at — when Bezel's model ran */}
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {row.bezelComputedAt ? (
                      <span className={computed.isToday ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                        {computed.label}
                      </span>
                    ) : (
                      <span className="text-slate-600">Waiting…</span>
                    )}
                  </td>

                  {/* We detected at — when our cron first saw the new timestamp */}
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {row.capturedAt ? (
                      <span className={detected.isToday ? 'text-sky-400' : 'text-slate-500'}>
                        {detected.label}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>

                  {/* Status badge */}
                  <td className="px-4 py-3 text-center">
                    {computed.isToday ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/40 border border-emerald-700/40 px-2 py-0.5 text-xs font-medium text-emerald-400">
                        <CheckCircle className="h-3 w-3" />
                        Updated
                      </span>
                    ) : row.bezelComputedAt ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-700/60 border border-slate-600 px-2 py-0.5 text-xs font-medium text-slate-400">
                        <Hourglass className="h-3 w-3" />
                        Yesterday
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 border border-slate-700 px-2 py-0.5 text-xs text-slate-600">
                        No data
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div className="px-4 py-2 border-t border-slate-700/40 bg-slate-800/40">
        <p className="text-xs text-slate-600">
          <span className="text-emerald-500 font-medium">Bezel Computed At</span> = timestamp from Bezel&apos;s API payload (when their model ran).
          {' '}<span className="text-sky-400 font-medium">We Detected At</span> = when our 15-min cron first saw the new value.
          The difference is your detection lag.
        </p>
      </div>
    </div>
  );
}
