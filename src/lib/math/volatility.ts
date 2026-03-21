/**
 * Volatility computation utilities.
 * All functions are pure and operate on arrays of numbers.
 * stdDev uses the sample standard deviation (N-1 denominator, ddof=1).
 */

export type VolWindow = 5 | 10 | 20 | 30 | 60;

const TRADING_DAYS_PER_YEAR = 252;
const ALL_WINDOWS: VolWindow[] = [5, 10, 20, 30, 60];

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------

/**
 * Compute log returns: r[i] = ln(prices[i+1] / prices[i])
 * Returns an array of length (prices.length - 1).
 * If a price pair is non-positive or non-finite, the return is NaN.
 */
export function computeLogReturns(prices: number[]): number[] {
  if (prices.length < 2) return [];
  const returns: number[] = new Array(prices.length - 1);
  for (let i = 0; i < prices.length - 1; i++) {
    const p0 = prices[i];
    const p1 = prices[i + 1];
    if (!Number.isFinite(p0) || !Number.isFinite(p1) || p0 <= 0 || p1 <= 0) {
      returns[i] = NaN;
    } else {
      returns[i] = Math.log(p1 / p0);
    }
  }
  return returns;
}

/**
 * Compute simple (arithmetic) returns: r[i] = (prices[i+1] - prices[i]) / prices[i]
 * Returns an array of length (prices.length - 1).
 */
export function computeSimpleReturns(prices: number[]): number[] {
  if (prices.length < 2) return [];
  const returns: number[] = new Array(prices.length - 1);
  for (let i = 0; i < prices.length - 1; i++) {
    const p0 = prices[i];
    const p1 = prices[i + 1];
    if (!Number.isFinite(p0) || !Number.isFinite(p1) || p0 === 0) {
      returns[i] = NaN;
    } else {
      returns[i] = (p1 - p0) / p0;
    }
  }
  return returns;
}

// ---------------------------------------------------------------------------
// Descriptive statistics
// ---------------------------------------------------------------------------

/**
 * Arithmetic mean of an array, ignoring NaN values.
 * Returns 0 if the array is empty or all values are NaN.
 */
export function mean(values: number[]): number {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return 0;
  return finite.reduce((sum, v) => sum + v, 0) / finite.length;
}

/**
 * Sample standard deviation (ddof = 1) of an array.
 * Ignores NaN values. Returns 0 if fewer than 2 valid observations.
 */
export function stdDev(values: number[]): number {
  const finite = values.filter(Number.isFinite);
  const n = finite.length;
  if (n < 2) return 0;
  const mu = finite.reduce((sum, v) => sum + v, 0) / n;
  const variance = finite.reduce((sum, v) => sum + (v - mu) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Annualization
// ---------------------------------------------------------------------------

/**
 * Annualize a daily volatility figure by multiplying by sqrt(252).
 */
export function annualizeVol(dailyVol: number): number {
  return dailyVol * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

// ---------------------------------------------------------------------------
// Rolling and windowed volatilities
// ---------------------------------------------------------------------------

/**
 * Compute realized volatility for multiple window lengths from a price series.
 *
 * For each window W:
 *   - Take the last W+1 prices (to get W log-returns)
 *   - Compute the sample std dev of those returns
 *   - If insufficient data, returns null for that window
 *
 * The returned vols are daily (not annualized).
 */
export function computeRollingVols(
  prices: number[],
  windows: VolWindow[] = ALL_WINDOWS,
): Record<VolWindow, number | null> {
  const logReturns = computeLogReturns(prices);

  const result = {} as Record<VolWindow, number | null>;
  for (const w of windows) {
    if (logReturns.length < w) {
      result[w] = null;
      continue;
    }
    const slice = logReturns.slice(-w);
    const vol = stdDev(slice);
    result[w] = Number.isFinite(vol) ? vol : null;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Percentile
// ---------------------------------------------------------------------------

/**
 * Compute the p-th percentile of `values` using linear interpolation.
 * p must be in [0, 100]. The array is sorted internally (does not mutate).
 * Returns NaN if the array is empty.
 */
export function percentile(values: number[], p: number): number {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return NaN;
  if (p <= 0) return Math.min(...finite);
  if (p >= 100) return Math.max(...finite);

  const sorted = [...finite].sort((a, b) => a - b);
  const n = sorted.length;

  // Linear interpolation index
  const index = (p / 100) * (n - 1);
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];

  const frac = index - lo;
  return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
}

// ---------------------------------------------------------------------------
// Rolling volatility series
// ---------------------------------------------------------------------------

/**
 * Compute a rolling volatility series over a price array.
 * Returns an array of the same length as prices.
 * Position i has null if there are fewer than (window + 1) prices up to and
 * including index i (i.e., the first (window) values are always null).
 *
 * The returned values are daily standard deviations of log returns.
 */
export function rollingVolSeries(prices: number[], window: number): (number | null)[] {
  if (window < 2) throw new RangeError('window must be >= 2');
  const result: (number | null)[] = new Array(prices.length).fill(null);

  for (let i = window; i < prices.length; i++) {
    // We need `window` log-returns, which requires `window + 1` prices
    const slice = prices.slice(i - window, i + 1);
    const returns = computeLogReturns(slice);
    const vol = stdDev(returns);
    result[i] = Number.isFinite(vol) ? vol : null;
  }

  return result;
}

// ---------------------------------------------------------------------------
// EWMA volatility (RiskMetrics)
// ---------------------------------------------------------------------------

/**
 * Compute EWMA (exponentially weighted moving average) volatility.
 *
 * Algorithm (RiskMetrics):
 *   variance[0] = returns[0]^2
 *   variance[t] = lambda * variance[t-1] + (1-lambda) * returns[t]^2
 *   ewmaVol = sqrt(last_variance) * sqrt(252)  [annualized]
 *
 * Default lambda = 0.94 (J.P. Morgan / RiskMetrics standard).
 * Returns 0 if returns array is empty.
 */
export function ewmaVol(returns: number[], lambda: number = 0.94): number {
  const finite = returns.filter(Number.isFinite);
  if (finite.length === 0) return 0;

  let variance = finite[0] ** 2;
  for (let t = 1; t < finite.length; t++) {
    variance = lambda * variance + (1 - lambda) * finite[t] ** 2;
  }

  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

// ---------------------------------------------------------------------------
// Drift estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the mean daily drift of a return series and assess statistical significance.
 *
 * Returns:
 *   - mean: arithmetic mean of the returns
 *   - tStat: t-statistic = mean / (stdDev / sqrt(N))
 *   - isSignificant: true if |tStat| >= 1.5 (relaxed threshold given short financial samples)
 */
export function estimateDrift(
  returns: number[],
): { mean: number; tStat: number; isSignificant: boolean } {
  const finite = returns.filter(Number.isFinite);
  const n = finite.length;

  if (n < 2) {
    return { mean: 0, tStat: 0, isSignificant: false };
  }

  const mu = finite.reduce((sum, v) => sum + v, 0) / n;
  const sd = stdDev(finite);

  if (sd === 0) {
    return { mean: mu, tStat: 0, isSignificant: false };
  }

  const tStat = mu / (sd / Math.sqrt(n));
  return {
    mean: mu,
    tStat,
    isSignificant: Math.abs(tStat) >= 1.5,
  };
}
