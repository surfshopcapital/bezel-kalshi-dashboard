/**
 * Correlation engine for the Bezel-Kalshi watch market dashboard.
 *
 * All functions handle edge cases gracefully:
 *   - Return null (not NaN) when a correlation cannot be computed
 *   - Filter out non-finite values before computation
 *   - Never throw on bad input
 */

// ---------------------------------------------------------------------------
// Pearson correlation
// ---------------------------------------------------------------------------

/**
 * Compute the Pearson correlation coefficient between x and y.
 *
 * Uses the sample covariance formula (N-1 denominator):
 *   cov(x,y) = Σ(xi - x̄)(yi - ȳ) / (N-1)
 *   r = cov(x,y) / (σx * σy)
 *
 * Returns null if:
 *   - Arrays have different lengths
 *   - Fewer than 3 valid (finite) paired observations
 *   - Either series has zero variance
 */
export function pearsonCorrelation(x: number[], y: number[]): number | null {
  if (x.length !== y.length) return null;

  // Collect finite pairs
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < x.length; i++) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) {
      pairs.push([x[i], y[i]]);
    }
  }

  const n = pairs.length;
  if (n < 3) return null;

  let sumX = 0, sumY = 0;
  for (const [xi, yi] of pairs) {
    sumX += xi;
    sumY += yi;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let covXY = 0, varX = 0, varY = 0;
  for (const [xi, yi] of pairs) {
    const dx = xi - meanX;
    const dy = yi - meanY;
    covXY += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  // N-1 denominator (sample covariance / variance)
  covXY /= (n - 1);
  varX /= (n - 1);
  varY /= (n - 1);

  if (varX <= 0 || varY <= 0) return null;

  const r = covXY / Math.sqrt(varX * varY);

  // Clamp to [-1, 1] to handle floating-point drift
  if (!Number.isFinite(r)) return null;
  return Math.min(1, Math.max(-1, r));
}

// ---------------------------------------------------------------------------
// Series alignment (inner join on dates)
// ---------------------------------------------------------------------------

export interface AlignedSeries {
  x: number[];
  y: number[];
  dates: string[];
}

/**
 * Align two time series on their common dates using an inner join.
 * Date matching is exact string comparison.
 * The returned arrays have the same length and are ordered chronologically
 * (order of dates as they appear in the intersection, preserving datesX order).
 */
export function alignSeries(
  valuesX: number[],
  datesX: string[],
  valuesY: number[],
  datesY: string[],
): AlignedSeries {
  // Build a lookup from date → value for Y
  const yMap = new Map<string, number>();
  for (let i = 0; i < datesY.length; i++) {
    if (Number.isFinite(valuesY[i])) {
      yMap.set(datesY[i], valuesY[i]);
    }
  }

  const x: number[] = [];
  const y: number[] = [];
  const dates: string[] = [];

  for (let i = 0; i < datesX.length; i++) {
    const date = datesX[i];
    const yVal = yMap.get(date);
    if (yVal !== undefined && Number.isFinite(valuesX[i])) {
      x.push(valuesX[i]);
      y.push(yVal);
      dates.push(date);
    }
  }

  return { x, y, dates };
}

// ---------------------------------------------------------------------------
// Correlation matrix
// ---------------------------------------------------------------------------

export interface CorrelationMatrixResult {
  ids: string[];
  names: string[];
  matrix: (number | null)[][];
}

export interface CorrelationSeries {
  id: string;
  name: string;
  returns: number[];
  dates: string[];
}

/**
 * Compute a pairwise correlation matrix for a set of return series.
 * If lookbackDays is provided, only the last N entries of each series are used.
 * The matrix is symmetric: matrix[i][j] === matrix[j][i].
 * Diagonal entries are 1 (by definition).
 */
export function computeCorrelationMatrix(
  series: CorrelationSeries[],
  lookbackDays?: number,
): CorrelationMatrixResult {
  const n = series.length;
  const ids = series.map((s) => s.id);
  const names = series.map((s) => s.name);
  const matrix: (number | null)[][] = Array.from({ length: n }, () =>
    new Array(n).fill(null),
  );

  // Pre-slice series if lookback is requested
  const sliced = series.map((s) => {
    if (lookbackDays !== undefined && lookbackDays > 0) {
      const start = Math.max(0, s.returns.length - lookbackDays);
      return {
        ...s,
        returns: s.returns.slice(start),
        dates: s.dates.slice(start),
      };
    }
    return s;
  });

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1; // diagonal

    for (let j = i + 1; j < n; j++) {
      const { x, y } = alignSeries(
        sliced[i].returns,
        sliced[i].dates,
        sliced[j].returns,
        sliced[j].dates,
      );
      const r = pearsonCorrelation(x, y);
      matrix[i][j] = r;
      matrix[j][i] = r; // symmetric
    }
  }

  return { ids, names, matrix };
}

// ---------------------------------------------------------------------------
// Rolling correlation
// ---------------------------------------------------------------------------

export interface RollingCorrelationPoint {
  date: string;
  correlation: number | null;
}

/**
 * Compute a rolling Pearson correlation between two pre-aligned return series.
 * x and y must be of the same length and aligned by dates.
 *
 * For each position i:
 *   - If i < window - 1: null (insufficient data)
 *   - Else: pearson over the slice [i-window+1, i] (inclusive)
 */
export function rollingCorrelation(
  x: number[],
  y: number[],
  dates: string[],
  window: number,
): RollingCorrelationPoint[] {
  const n = Math.min(x.length, y.length, dates.length);
  const result: RollingCorrelationPoint[] = [];

  for (let i = 0; i < n; i++) {
    if (i < window - 1) {
      result.push({ date: dates[i], correlation: null });
      continue;
    }
    const sliceX = x.slice(i - window + 1, i + 1);
    const sliceY = y.slice(i - window + 1, i + 1);
    result.push({ date: dates[i], correlation: pearsonCorrelation(sliceX, sliceY) });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Lead-lag correlation
// ---------------------------------------------------------------------------

export interface LeadLagPoint {
  lag: number;
  correlation: number | null;
  /** Human-readable description of the relationship */
  description: string;
}

/**
 * Compute lead-lag correlations between x and y for lags in [-maxLag, +maxLag].
 *
 * Convention:
 *   lag > 0: x leads y by `lag` days  → correlate x[t] with y[t+lag]
 *   lag = 0: contemporaneous          → correlate x[t] with y[t]
 *   lag < 0: y leads x by |lag| days  → correlate x[t-|lag|] with y[t]
 */
export function leadLagCorrelation(
  x: number[],
  y: number[],
  dates: string[],
  maxLag: number,
): LeadLagPoint[] {
  const n = Math.min(x.length, y.length);
  const results: LeadLagPoint[] = [];
  const absMax = Math.abs(Math.floor(maxLag));

  for (let lag = -absMax; lag <= absMax; lag++) {
    let xSlice: number[];
    let ySlice: number[];

    if (lag === 0) {
      xSlice = x.slice(0, n);
      ySlice = y.slice(0, n);
    } else if (lag > 0) {
      // x leads y: pair x[t] with y[t+lag]
      xSlice = x.slice(0, n - lag);
      ySlice = y.slice(lag, n);
    } else {
      // y leads x: pair x[t-|lag|] with y[t]
      const absLag = -lag;
      xSlice = x.slice(absLag, n);
      ySlice = y.slice(0, n - absLag);
    }

    const correlation = pearsonCorrelation(xSlice, ySlice);

    let description: string;
    if (lag === 0) {
      description = 'contemporaneous';
    } else if (lag > 0) {
      description = `x leads y by ${lag} day${lag === 1 ? '' : 's'}`;
    } else {
      const absLag = -lag;
      description = `y leads x by ${absLag} day${absLag === 1 ? '' : 's'}`;
    }

    results.push({ lag, correlation, description });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Regime classification
// ---------------------------------------------------------------------------

export type Regime = 'calm' | 'high_vol' | 'event_driven';

/**
 * Classify the volatility regime of a return series.
 *
 * Algorithm:
 *   1. Compute rolling std dev over the last `window` returns.
 *   2. Compute std dev over the whole series for reference.
 *   3. Compute median rolling vol (all windows, not just last).
 *   4. If any single return > 3 * full-series std dev → event_driven
 *   5. If last-window vol < 0.7 * median → calm
 *   6. Else → high_vol
 *
 * Default window = 20.
 */
export function classifyRegime(returns: number[], window: number = 20): Regime {
  const finite = returns.filter(Number.isFinite);
  if (finite.length < 2) return 'high_vol';

  const n = finite.length;
  const fullMean = finite.reduce((s, v) => s + v, 0) / n;
  const fullVar = finite.reduce((s, v) => s + (v - fullMean) ** 2, 0) / (n - 1);
  const fullStd = Math.sqrt(fullVar);

  // Check for event-driven: any return exceeds 3-sigma
  for (const r of finite) {
    if (Math.abs(r) > 3 * fullStd) return 'event_driven';
  }

  // Rolling std devs over all windows of length `window`
  const rollingStds: number[] = [];
  for (let i = window - 1; i < n; i++) {
    const slice = finite.slice(i - window + 1, i + 1);
    const sliceMean = slice.reduce((s, v) => s + v, 0) / slice.length;
    const sliceVar = slice.reduce((s, v) => s + (v - sliceMean) ** 2, 0) / (slice.length - 1);
    rollingStds.push(Math.sqrt(sliceVar));
  }

  if (rollingStds.length === 0) return 'high_vol';

  // Median rolling vol
  const sorted = [...rollingStds].sort((a, b) => a - b);
  const medianVol = sorted.length % 2 === 1
    ? sorted[Math.floor(sorted.length / 2)]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const lastVol = rollingStds[rollingStds.length - 1];

  if (lastVol < 0.7 * medianVol) return 'calm';
  return 'high_vol';
}

// ---------------------------------------------------------------------------
// Correlation by regime
// ---------------------------------------------------------------------------

/**
 * Compute Pearson correlation between xReturns and yReturns, stratified by
 * the volatility regime of xPrices.
 *
 * Regime is assessed on a rolling 20-day basis for each data point, then
 * all points belonging to each regime are pooled and correlated together.
 *
 * xReturns, yReturns, and xPrices must all be the same length.
 * Returns null for any regime with fewer than 3 paired observations.
 */
export function correlationByRegime(
  xReturns: number[],
  yReturns: number[],
  xPrices: number[],
): Record<Regime, number | null> {
  const n = Math.min(xReturns.length, yReturns.length, xPrices.length);
  const ROLLING_WINDOW = 20;

  const buckets: Record<Regime, { x: number[]; y: number[] }> = {
    calm: { x: [], y: [] },
    high_vol: { x: [], y: [] },
    event_driven: { x: [], y: [] },
  };

  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(xReturns[i]) || !Number.isFinite(yReturns[i])) continue;

    // Use rolling window of returns ending at i to classify regime
    const windowStart = Math.max(0, i - ROLLING_WINDOW + 1);
    const windowReturns = xReturns.slice(windowStart, i + 1).filter(Number.isFinite);
    const regime = windowReturns.length >= 2 ? classifyRegime(windowReturns, Math.min(ROLLING_WINDOW, windowReturns.length)) : 'high_vol';

    buckets[regime].x.push(xReturns[i]);
    buckets[regime].y.push(yReturns[i]);
  }

  return {
    calm: pearsonCorrelation(buckets.calm.x, buckets.calm.y),
    high_vol: pearsonCorrelation(buckets.high_vol.x, buckets.high_vol.y),
    event_driven: pearsonCorrelation(buckets.event_driven.x, buckets.event_driven.y),
  };
}

// ---------------------------------------------------------------------------
// Feature importance
// ---------------------------------------------------------------------------

export interface FeatureImportanceResult {
  id: string;
  name: string;
  correlation: number | null;
  r2: number | null;
  rank: number;
}

export interface TargetSeries {
  id: string;
  returns: number[];
  dates: string[];
}

export interface PredictorSeries {
  id: string;
  name: string;
  returns: number[];
  dates: string[];
}

/**
 * Rank predictor series by their absolute Pearson correlation with the target.
 *
 * For each predictor:
 *   1. Align to the target on matching dates (inner join)
 *   2. Compute Pearson correlation
 *   3. Compute R² = correlation²
 *   4. Rank by |correlation| descending (rank 1 = most predictive)
 *
 * Predictors with null correlation are sorted after all valid predictors
 * and assigned ranks after all valid ones.
 */
export function featureImportance(
  target: TargetSeries,
  predictors: PredictorSeries[],
): FeatureImportanceResult[] {
  const unranked: Omit<FeatureImportanceResult, 'rank'>[] = predictors.map((pred) => {
    const { x: targetAligned, y: predAligned } = alignSeries(
      target.returns,
      target.dates,
      pred.returns,
      pred.dates,
    );

    const correlation = pearsonCorrelation(targetAligned, predAligned);
    const r2 = correlation !== null ? correlation ** 2 : null;

    return {
      id: pred.id,
      name: pred.name,
      correlation,
      r2,
    };
  });

  // Sort by |correlation| descending; nulls last
  unranked.sort((a, b) => {
    const absA = a.correlation !== null ? Math.abs(a.correlation) : -1;
    const absB = b.correlation !== null ? Math.abs(b.correlation) : -1;
    return absB - absA;
  });

  return unranked.map((item, index) => ({ ...item, rank: index + 1 }));
}
