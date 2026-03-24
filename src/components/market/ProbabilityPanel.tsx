'use client';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';

export interface ProbabilityOutput {
  currentPrice: number | null;
  strikeValue: number | null;
  strikeDirection: 'above' | 'below' | null;
  daysRemaining: number | null;
  expirationDate: string | null;
  distanceToStrike: number | null;
  distanceToStrikeSigmas: number | null;
  modeledProbability: number | null;
  impliedProbability: number | null;
  modelEdge: number | null;
  annualizedVol: number | null;
  rollingVols?: Record<string, number>;
  scenarios?: ScenarioRow[];
  percentiles?: PercentileRow[];
  computedAt?: string | null;
}

interface ScenarioRow {
  volAssumption: number;
  probAbove: number;
  probBelow: number;
  oneSigmaMove: number;
}

interface PercentileRow {
  percentile: number;
  price: number;
}

interface ProbabilityPanelProps {
  probRun: ProbabilityOutput;
  rollingVols?: Record<string, number>;
}

function MetricCard({
  label,
  value,
  sub,
  highlight,
  highlightColor = 'text-blue-400',
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  highlightColor?: string;
}) {
  return (
    <div className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2.5">
      <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`font-mono text-base font-bold leading-tight ${highlight ? highlightColor : 'text-slate-100'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}

const VOL_WINDOWS: [string, string][] = [
  ['5d', '5-Day'],
  ['10d', '10-Day'],
  ['20d', '20-Day'],
  ['30d', '30-Day'],
  ['60d', '60-Day'],
];

function volColor(vol: number): string {
  if (vol > 0.8) return 'text-red-400';
  if (vol > 0.5) return 'text-amber-400';
  if (vol > 0.3) return 'text-yellow-400';
  return 'text-green-400';
}

function probColor(prob: number): string {
  if (prob >= 70) return 'bg-green-500';
  if (prob >= 50) return 'bg-blue-500';
  if (prob >= 30) return 'bg-amber-500';
  return 'bg-red-500';
}

export function ProbabilityPanel({ probRun, rollingVols: rollingVolsProp }: ProbabilityPanelProps) {
  const {
    currentPrice,
    strikeValue,
    strikeDirection,
    daysRemaining,
    distanceToStrike,
    distanceToStrikeSigmas,
    modeledProbability,
    impliedProbability,
    modelEdge,
    annualizedVol,
    scenarios,
    percentiles,
    computedAt,
  } = probRun;

  const rollingVols = rollingVolsProp ?? probRun.rollingVols;

  const edgePositive = (modelEdge ?? 0) >= 0;
  const hasEdge = modelEdge != null && Math.abs(modelEdge) > 2;

  return (
    <div className="space-y-5">
      {/* Section 1: Key Metrics */}
      <section>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Key Metrics
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricCard
            label="Current Price"
            value={currentPrice != null ? formatCurrency(currentPrice) : '—'}
          />
          <MetricCard
            label={`Strike (${strikeDirection ?? '…'})`}
            value={strikeValue != null ? formatCurrency(strikeValue) : '—'}
          />
          <MetricCard
            label="Days Remaining"
            value={daysRemaining != null ? `${Math.round(daysRemaining)}d` : '—'}
            highlight={(daysRemaining ?? 999) <= 7}
            highlightColor="text-amber-400"
          />
          <MetricCard
            label="Distance"
            value={distanceToStrike != null ? formatCurrency(Math.abs(distanceToStrike)) : '—'}
            sub={
              distanceToStrikeSigmas != null
                ? `${distanceToStrikeSigmas >= 0 ? '+' : ''}${distanceToStrikeSigmas.toFixed(2)}σ`
                : undefined
            }
            highlight={
              distanceToStrikeSigmas != null && Math.abs(distanceToStrikeSigmas) < 1.0
            }
            highlightColor="text-amber-400"
          />
        </div>
      </section>

      {/* Section 2: Probability Comparison */}
      <section>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Probability Comparison
        </h3>
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 space-y-3">
          {/* Model probability bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-slate-300">Model Probability</span>
              <span className="font-mono text-sm font-bold text-blue-400">
                {modeledProbability != null ? `${modeledProbability.toFixed(1)}%` : '—'}
              </span>
            </div>
            <div className="relative h-3 rounded-full bg-slate-700 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-blue-500 transition-all"
                style={{ width: `${Math.min(100, modeledProbability ?? 0)}%` }}
              />
            </div>
          </div>

          {/* Kalshi implied probability bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-slate-300">Kalshi Implied</span>
              <span className="font-mono text-sm font-bold text-slate-300">
                {impliedProbability != null ? `${impliedProbability.toFixed(1)}%` : '—'}
              </span>
            </div>
            <div className="relative h-3 rounded-full bg-slate-700 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-slate-500 transition-all"
                style={{ width: `${Math.min(100, impliedProbability ?? 0)}%` }}
              />
            </div>
          </div>

          {/* Edge callout */}
          {hasEdge && (
            <div
              className={`rounded-md border px-3 py-2 flex items-center gap-2 ${
                edgePositive
                  ? 'border-amber-700/50 bg-amber-900/20'
                  : 'border-orange-700/50 bg-orange-900/20'
              }`}
            >
              <span
                className={`text-sm font-semibold ${
                  edgePositive ? 'text-amber-400' : 'text-orange-400'
                }`}
              >
                Edge: {edgePositive ? '+' : ''}
                {modelEdge!.toFixed(1)}%
              </span>
              <span className="text-xs text-slate-500">
                — model {edgePositive ? 'favors YES' : 'favors NO'} vs. Kalshi market
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Section 3: Vol Regime */}
      {rollingVols && Object.keys(rollingVols).length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Volatility Regime
            {annualizedVol != null && (
              <span className="ml-2 text-slate-600 normal-case font-normal">
                (current ann.: {(annualizedVol * 100).toFixed(1)}%)
              </span>
            )}
          </h3>
          <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Window
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Ann. Vol
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Regime
                  </th>
                </tr>
              </thead>
              <tbody>
                {VOL_WINDOWS.map(([key, label]) => {
                  const vol = rollingVols[key];
                  if (vol == null) return null;
                  const volPct = vol * 100;
                  const regime =
                    vol > 0.8 ? 'Extreme' : vol > 0.5 ? 'High' : vol > 0.3 ? 'Moderate' : 'Low';
                  return (
                    <tr key={key} className="border-b border-slate-800 hover:bg-slate-800/50">
                      <td className="px-3 py-2 text-slate-300 font-medium">{label}</td>
                      <td className={`px-3 py-2 text-right font-mono font-bold ${volColor(vol)}`}>
                        {volPct.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                            vol > 0.8
                              ? 'bg-red-900/50 text-red-400'
                              : vol > 0.5
                              ? 'bg-amber-900/50 text-amber-400'
                              : vol > 0.3
                              ? 'bg-yellow-900/50 text-yellow-400'
                              : 'bg-green-900/50 text-green-400'
                          }`}
                        >
                          {regime}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Section 4: Scenario Table */}
      {scenarios && scenarios.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Vol Scenarios
          </h3>
          <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Vol Assumption
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-green-600 uppercase tracking-wide">
                    P(Above)
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-red-600 uppercase tracking-wide">
                    P(Below)
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">
                    1σ Move
                  </th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((row, i) => (
                  <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50">
                    <td className="px-3 py-2 font-mono text-slate-300">
                      {(row.volAssumption * 100).toFixed(0)}% ann.
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-mono font-semibold text-green-400`}>
                        {(row.probAbove * 100).toFixed(1)}%
                      </span>
                      <div className="mt-0.5 h-1.5 w-full rounded-full bg-slate-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${probColor(row.probAbove * 100)}`}
                          style={{ width: `${row.probAbove * 100}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="font-mono font-semibold text-red-400">
                        {(row.probBelow * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-300">
                      {formatCurrency(row.oneSigmaMove)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Section 5: Percentile Distribution */}
      {percentiles && percentiles.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Price Percentile Distribution
          </h3>
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
            {/* Strike reference line info */}
            {strikeValue != null && (
              <p className="text-xs text-slate-500 mb-3">
                Strike:{' '}
                <span className="font-mono font-medium text-amber-400">
                  {formatCurrency(strikeValue)}
                </span>
                — dashed line below
              </p>
            )}
            <div className="space-y-1.5">
              {percentiles.map((row) => {
                const isAtStrike =
                  strikeValue != null &&
                  row.price >= strikeValue * 0.99 &&
                  row.price <= strikeValue * 1.01;
                return (
                  <div key={row.percentile} className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-right text-xs font-mono text-slate-500">
                      P{row.percentile}
                    </span>
                    <div className="relative flex-1 h-4 rounded bg-slate-800 overflow-visible">
                      <div
                        className={`absolute inset-y-0 left-0 rounded ${
                          isAtStrike ? 'bg-amber-500/50' : 'bg-blue-600/60'
                        }`}
                        style={{ width: `${row.percentile}%` }}
                      />
                      {strikeValue != null && (
                        <div
                          className="absolute inset-y-0 w-px bg-amber-400"
                          style={{
                            left: `${Math.min(
                              100,
                              Math.max(
                                0,
                                ((row.price - (percentiles[0]?.price ?? 0)) /
                                  ((percentiles[percentiles.length - 1]?.price ?? 1) -
                                    (percentiles[0]?.price ?? 0))) *
                                  100,
                              ),
                            )}%`,
                          }}
                        />
                      )}
                    </div>
                    <span
                      className={`w-20 shrink-0 text-right text-xs font-mono font-medium ${
                        isAtStrike ? 'text-amber-400' : 'text-slate-300'
                      }`}
                    >
                      {formatCurrency(row.price)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Computed at footer */}
      {computedAt && (
        <p className="text-xs text-slate-600">
          Model computed {formatDate(computedAt, 'relative')}
        </p>
      )}
    </div>
  );
}
