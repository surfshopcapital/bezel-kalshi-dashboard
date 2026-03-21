'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { useCorrelations } from '@/hooks/useCorrelations';
import { CorrelationHeatmap } from '@/components/research/CorrelationHeatmap';
import { ErrorDisplay } from '@/components/shared/ErrorDisplay';
import { LoadingCard } from '@/components/shared/LoadingCard';
import { formatDate } from '@/lib/utils/formatters';

const LOOKBACK_OPTIONS = [7, 14, 30, 60, 90] as const;
type Lookback = (typeof LOOKBACK_OPTIONS)[number];

// ---------------------------------------------------------------------------
// CSV download helper
// ---------------------------------------------------------------------------

function downloadCorrelationCSV(
  ids: string[],
  names: string[],
  matrix: (number | null)[][],
  lookback: number,
) {
  const header = ['Entity', ...names].join(',');
  const rows = ids.map((id, i) => {
    const name = names[i];
    const cells = matrix[i].map((v) =>
      v != null ? v.toFixed(4) : '',
    );
    return [name, ...cells].join(',');
  });
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `correlations-${lookback}d-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Regime legend
// ---------------------------------------------------------------------------

const REGIME_LABELS = [
  { label: 'Strong Positive', range: '≥ 0.8', color: 'bg-green-400' },
  { label: 'Moderate Positive', range: '0.5 – 0.8', color: 'bg-green-300/70' },
  { label: 'Weak / None', range: '-0.5 – 0.5', color: 'bg-slate-400' },
  { label: 'Moderate Negative', range: '-0.8 – -0.5', color: 'bg-red-300/70' },
  { label: 'Strong Negative', range: '≤ -0.8', color: 'bg-red-400' },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CorrelationsPage() {
  const [lookback, setLookback] = useState<Lookback>(30);

  const { data, isLoading, error } = useCorrelations(lookback);

  const matrix = data?.data;
  const meta = data?.meta;

  // Fill null values with 0 for the heatmap renderer
  const filledMatrix = matrix
    ? matrix.matrix.map((row: (number | null)[]) =>
        row.map((v) => (v ?? 0)),
      )
    : [];

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">
            Correlation Research
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Pairwise Pearson correlations of log returns across all tracked Bezel
            entities. Higher correlation suggests the two series move together.
          </p>
        </div>

        {/* Download button */}
        {matrix && matrix.ids.length > 0 && (
          <button
            onClick={() =>
              downloadCorrelationCSV(
                matrix.ids,
                matrix.names,
                filledMatrix,
                lookback,
              )
            }
            className="shrink-0 flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-600 hover:text-slate-100 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        )}
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Lookback selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Lookback:
          </span>
          <div className="flex items-center gap-1">
            {LOOKBACK_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setLookback(opt)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  lookback === opt
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {opt}d
              </button>
            ))}
          </div>
        </div>

        {/* Metadata */}
        {meta && (
          <div className="flex items-center gap-3 text-xs text-slate-500 ml-auto">
            {meta.entityCount != null && (
              <span>
                <span className="font-medium text-slate-400">
                  {meta.entityCount}
                </span>{' '}
                entities
              </span>
            )}
            {meta.pairCount != null && (
              <span>
                <span className="font-medium text-slate-400">
                  {meta.pairCount}
                </span>{' '}
                pairs
              </span>
            )}
            {matrix?.computedAt && (
              <span>
                Computed{' '}
                <span className="text-slate-400">
                  {formatDate(matrix.computedAt, 'relative')}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Heatmap */}
      {isLoading ? (
        <LoadingCard />
      ) : matrix && matrix.ids.length > 0 ? (
        <CorrelationHeatmap
          ids={matrix.ids}
          names={matrix.names}
          matrix={filledMatrix}
        />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-slate-700 bg-slate-800 py-20 text-center">
          <p className="text-base font-medium text-slate-300">
            No correlation data yet
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Correlations are computed every 6 hours. Run the{' '}
            <span className="font-mono">compute-correlations</span> job to
            generate the initial matrix.
          </p>
          <a
            href="/api/jobs/compute-correlations"
            className="mt-4 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition-colors"
          >
            Run Now
          </a>
        </div>
      )}

      {/* Regime legend */}
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Correlation Regime Guide
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {REGIME_LABELS.map((r) => (
            <div key={r.label} className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-sm shrink-0 ${r.color}`} />
              <div>
                <p className="text-xs font-medium text-slate-300">{r.label}</p>
                <p className="text-xs text-slate-500 font-mono">{r.range}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Methodology notes */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-xs text-slate-500 leading-relaxed space-y-1.5">
        <p className="font-semibold text-slate-400">Methodology</p>
        <p>
          Correlation is computed as the Pearson correlation coefficient between
          the log-return series of two Bezel entities over the selected lookback
          window. Daily prices are aligned on calendar date; only dates present
          in both series are included.
        </p>
        <p>
          Pairs with fewer than 5 overlapping observations are excluded. The
          computation runs automatically every 6 hours. All values are symmetric
          (ρ(A,B) = ρ(B,A)) and the diagonal is always 1.
        </p>
      </div>
    </div>
  );
}
