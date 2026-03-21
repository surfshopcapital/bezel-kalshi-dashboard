/**
 * Probability engine for Bezel-Kalshi watch market contracts.
 *
 * Implements:
 *   - normalModel: log-normal / Black-Scholes style probability calculation
 *   - empiricalModel: historical percentile-based probability
 *   - buildProbabilityInputs: helper to construct inputs from DB data
 *
 * All models operate on an array of historical prices (not returns).
 * The engine computes realized volatility, then projects it forward to
 * calculate the probability that the price is above or below a strike at expiry.
 */

import type {
  ProbabilityOutput,
  ProbabilityInputs,
  PercentileBand,
  ScenarioRow,
  StrikeDirection,
  VolatilityWindow,
} from '@/types';

// ---------------------------------------------------------------------------
// Trading calendar helper
// ---------------------------------------------------------------------------

const TRADING_DAYS_PER_YEAR = 252;

/**
 * Estimate calendar days between now and a future date.
 */
export function daysUntil(date: Date): number {
  const diff = date.getTime() - Date.now();
  return Math.max(0, diff / (1000 * 60 * 60 * 24));
}

/**
 * Convert calendar days to approximate trading days (Mon–Fri, no holidays).
 */
export function calendarToTradingDays(calendarDays: number): number {
  return Math.round(calendarDays * (5 / 7));
}

// ---------------------------------------------------------------------------
// Log returns
// ---------------------------------------------------------------------------

/**
 * Compute log returns from a price series.
 * Returns an array of length (prices.length - 1).
 */
export function computeLogReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    const curr = prices[i];
    if (prev > 0 && curr > 0) {
      returns.push(Math.log(curr / prev));
    }
  }
  return returns;
}

/**
 * Compute mean and sample standard deviation of an array.
 */
export function stats(arr: number[]): { mean: number; stdDev: number } {
  if (arr.length === 0) return { mean: 0, stdDev: 0 };
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance =
    arr.length < 2
      ? 0
      : arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
  return { mean, stdDev: Math.sqrt(variance) };
}

/**
 * Compute realized daily volatility from a windowed slice of log returns.
 */
export function realizedDailyVol(logReturns: number[], window: number): number {
  const slice = logReturns.slice(-window);
  if (slice.length < 2) return 0;
  return stats(slice).stdDev;
}

// ---------------------------------------------------------------------------
// Normal CDF (Abramowitz & Stegun approximation, error < 1.5e-7)
// ---------------------------------------------------------------------------

export function normalCdf(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const sign = x >= 0 ? 1 : -1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-z * z);
  return 0.5 * (1 + sign * erf);
}

// ---------------------------------------------------------------------------
// Percentile bands
// ---------------------------------------------------------------------------

const PERCENTILES = [5, 10, 25, 50, 75, 90, 95];

function buildPercentileBands(
  currentPrice: number,
  drift: number,
  annualizedVol: number,
  tradingDaysToExpiry: number,
  strike: number,
): PercentileBand[] {
  const t = tradingDaysToExpiry / TRADING_DAYS_PER_YEAR;
  if (t <= 0 || annualizedVol <= 0) {
    return PERCENTILES.map((p) => ({
      percentile: p,
      price: currentPrice,
      aboveStrike: currentPrice > strike,
    }));
  }

  return PERCENTILES.map((percentile) => {
    // Inverse normal CDF approximation
    const p = percentile / 100;
    const z = inverseNormalCdf(p);
    const logReturn = (drift - 0.5 * annualizedVol ** 2) * t + annualizedVol * Math.sqrt(t) * z;
    const price = currentPrice * Math.exp(logReturn);
    return { percentile, price, aboveStrike: price > strike };
  });
}

// ---------------------------------------------------------------------------
// Scenario table
// ---------------------------------------------------------------------------

function buildScenarioTable(
  currentPrice: number,
  strike: number,
  tradingDaysToExpiry: number,
  baseVol: number,
): ScenarioRow[] {
  // Scenario vols: 50%, 75%, 100%, 125%, 150%, 200% of base, plus fixed levels
  const volMultipliers = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  const t = tradingDaysToExpiry / TRADING_DAYS_PER_YEAR;

  return volMultipliers.map((mult) => {
    const vol = baseVol * mult;
    const { probAbove, probBelow } = lognormalProbabilities(
      currentPrice,
      strike,
      vol,
      t,
      0,
    );
    const oneSigmaMove = currentPrice * vol * Math.sqrt(t);
    const expectedPrice = currentPrice * Math.exp(0.5 * vol ** 2 * t); // under risk-neutral measure drift=0
    return {
      volAssumption: vol,
      probAbove,
      probBelow,
      oneSigmaMove,
      expectedPrice,
    };
  });
}

// ---------------------------------------------------------------------------
// Core lognormal probability calculation
// ---------------------------------------------------------------------------

function lognormalProbabilities(
  currentPrice: number,
  strike: number,
  annualizedVol: number,
  timeYears: number,
  annualizedDrift: number,
): { probAbove: number; probBelow: number } {
  if (timeYears <= 0 || annualizedVol <= 0 || currentPrice <= 0 || strike <= 0) {
    const probAbove = currentPrice > strike ? 1 : 0;
    return { probAbove, probBelow: 1 - probAbove };
  }

  const d2 =
    (Math.log(currentPrice / strike) +
      (annualizedDrift - 0.5 * annualizedVol ** 2) * timeYears) /
    (annualizedVol * Math.sqrt(timeYears));

  const probAbove = normalCdf(d2);
  return { probAbove, probBelow: 1 - probAbove };
}

// ---------------------------------------------------------------------------
// Confidence score
// ---------------------------------------------------------------------------

function computeConfidenceScore(
  sampleSize: number,
  annualizedVol: number,
  daysToExpiry: number,
): number {
  // Penalise for short history
  const historyCScore = Math.min(1, sampleSize / 60);
  // Penalise for extreme vol (> 100% annualised)
  const volScore = Math.max(0, 1 - Math.max(0, annualizedVol - 1));
  // Penalise for very short or very long expiry
  const expiryScore =
    daysToExpiry < 1
      ? 0
      : daysToExpiry > 365
      ? 0.5
      : Math.min(1, daysToExpiry / 30);

  return Math.max(0, Math.min(1, (historyCScore + volScore + expiryScore) / 3));
}

// ---------------------------------------------------------------------------
// Inverse normal CDF (Beasley-Springer-Moro approximation)
// ---------------------------------------------------------------------------

function inverseNormalCdf(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  } else if (p <= pHigh) {
    q = p - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
}

// ---------------------------------------------------------------------------
// Normal model (log-normal, Black-Scholes style)
// ---------------------------------------------------------------------------

/**
 * Compute probability output using the log-normal (normal returns) model.
 */
export function normalModel(inputs: ProbabilityInputs): ProbabilityOutput {
  const {
    priceHistory,
    currentPrice,
    strike,
    strikeDirection,
    daysToExpiry,
    tradingDaysToExpiry,
    volWindow,
    kalshiImpliedProb,
  } = inputs;

  const logReturns = computeLogReturns(priceHistory);
  const windowedReturns = logReturns.slice(-volWindow);
  const dailyVol = stats(windowedReturns).stdDev;
  const annualizedVol = dailyVol * Math.sqrt(TRADING_DAYS_PER_YEAR);
  const timeYears = tradingDaysToExpiry / TRADING_DAYS_PER_YEAR;
  const annualizedDrift = 0; // risk-neutral; can be enhanced with historical drift

  const { probAbove, probBelow } = lognormalProbabilities(
    currentPrice,
    strike,
    annualizedVol,
    timeYears,
    annualizedDrift,
  );

  const oneSigmaMove = currentPrice * annualizedVol * Math.sqrt(timeYears);
  const distanceToStrike = currentPrice - strike;
  const distanceToStrikeSigmas =
    oneSigmaMove !== 0 ? distanceToStrike / oneSigmaMove : 0;

  const expectedPriceAtExpiry =
    currentPrice * Math.exp(annualizedDrift * timeYears);

  const percentileBands = buildPercentileBands(
    currentPrice,
    annualizedDrift,
    annualizedVol,
    tradingDaysToExpiry,
    strike,
  );

  const scenarioTable = buildScenarioTable(
    currentPrice,
    strike,
    tradingDaysToExpiry,
    annualizedVol,
  );

  const confidenceScore = computeConfidenceScore(
    windowedReturns.length,
    annualizedVol,
    daysToExpiry,
  );

  // Model probability in the direction of the contract
  const modelProb = strikeDirection === 'above' ? probAbove : probBelow;
  const kalshiProb = kalshiImpliedProb ?? null;
  const modelEdge = kalshiProb !== null ? modelProb - kalshiProb : null;

  return {
    modelType: 'normal',
    currentPrice,
    strike,
    strikeDirection,
    daysToExpiry,
    volWindow,
    realizedDailyVol: dailyVol,
    annualizedVol,
    probabilityAbove: probAbove,
    probabilityBelow: probBelow,
    expectedPriceAtExpiry,
    oneSigmaMove,
    distanceToStrike,
    distanceToStrikeSigmas,
    percentileBands,
    scenarioTable,
    confidenceScore,
    kalshiImpliedProb: kalshiProb,
    modelEdge,
    mcPaths: null,
  };
}

// ---------------------------------------------------------------------------
// Empirical model (historical percentile-based)
// ---------------------------------------------------------------------------

/**
 * Compute probability using the empirical distribution of historical returns.
 * Samples forward T-day returns from the historical series.
 */
export function empiricalModel(inputs: ProbabilityInputs): ProbabilityOutput {
  const {
    priceHistory,
    currentPrice,
    strike,
    strikeDirection,
    daysToExpiry,
    tradingDaysToExpiry,
    volWindow,
    kalshiImpliedProb,
  } = inputs;

  const horizon = Math.max(1, tradingDaysToExpiry);
  const logReturns = computeLogReturns(priceHistory);

  // Build overlapping T-day cumulative log-returns
  const cumulativeReturns: number[] = [];
  for (let i = 0; i <= logReturns.slice(-volWindow).length - horizon; i++) {
    const slice = logReturns.slice(i, i + horizon);
    cumulativeReturns.push(slice.reduce((s, v) => s + v, 0));
  }

  // If we don't have enough history, fall back to normal model
  if (cumulativeReturns.length < 5) {
    return normalModel(inputs);
  }

  // Simulate projected prices
  const projectedPrices = cumulativeReturns.map((r) => currentPrice * Math.exp(r));

  const aboveCount = projectedPrices.filter((p) => p > strike).length;
  const probAbove = aboveCount / projectedPrices.length;
  const probBelow = 1 - probAbove;

  projectedPrices.sort((a, b) => a - b);
  const expectedPriceAtExpiry =
    projectedPrices.reduce((s, v) => s + v, 0) / projectedPrices.length;

  // Volatility metrics from full series
  const dailyVol = stats(logReturns.slice(-volWindow)).stdDev;
  const annualizedVol = dailyVol * Math.sqrt(TRADING_DAYS_PER_YEAR);
  const timeYears = tradingDaysToExpiry / TRADING_DAYS_PER_YEAR;
  const oneSigmaMove = currentPrice * annualizedVol * Math.sqrt(timeYears);
  const distanceToStrike = currentPrice - strike;
  const distanceToStrikeSigmas = oneSigmaMove !== 0 ? distanceToStrike / oneSigmaMove : 0;

  const percentileBands: PercentileBand[] = PERCENTILES.map((pct) => {
    const idx = Math.min(
      projectedPrices.length - 1,
      Math.floor((pct / 100) * projectedPrices.length),
    );
    const price = projectedPrices[idx];
    return { percentile: pct, price, aboveStrike: price > strike };
  });

  const scenarioTable = buildScenarioTable(
    currentPrice,
    strike,
    tradingDaysToExpiry,
    annualizedVol,
  );

  const confidenceScore = computeConfidenceScore(
    cumulativeReturns.length,
    annualizedVol,
    daysToExpiry,
  );

  const modelProb = strikeDirection === 'above' ? probAbove : probBelow;
  const kalshiProb = kalshiImpliedProb ?? null;
  const modelEdge = kalshiProb !== null ? modelProb - kalshiProb : null;

  return {
    modelType: 'empirical',
    currentPrice,
    strike,
    strikeDirection,
    daysToExpiry,
    volWindow,
    realizedDailyVol: dailyVol,
    annualizedVol,
    probabilityAbove: probAbove,
    probabilityBelow: probBelow,
    expectedPriceAtExpiry,
    oneSigmaMove,
    distanceToStrike,
    distanceToStrikeSigmas,
    percentileBands,
    scenarioTable,
    confidenceScore,
    kalshiImpliedProb: kalshiProb,
    modelEdge,
    mcPaths: null,
  };
}

// ---------------------------------------------------------------------------
// Public dispatch
// ---------------------------------------------------------------------------

/**
 * Run the probability model specified by inputs.modelType.
 * Falls back to normalModel if the specified model is unavailable.
 */
export function runProbabilityModel(inputs: ProbabilityInputs): ProbabilityOutput {
  switch (inputs.modelType) {
    case 'normal':
      return normalModel(inputs);
    case 'empirical':
      return empiricalModel(inputs);
    case 'monte_carlo':
      // Monte Carlo uses the same lognormal assumptions as normal for now;
      // a full MC implementation would simulate many paths.
      return normalModel({ ...inputs, modelType: 'monte_carlo' });
    case 'ornstein_uhlenbeck':
      // OU requires mean-reversion parameters; fall back to normal.
      return normalModel({ ...inputs, modelType: 'ornstein_uhlenbeck' });
    default:
      return normalModel(inputs);
  }
}

// ---------------------------------------------------------------------------
// Build inputs helper
// ---------------------------------------------------------------------------

export function buildProbabilityInputs(opts: {
  priceHistory: number[];
  currentPrice: number;
  strike: number;
  strikeDirection: StrikeDirection;
  expirationDate: Date | null;
  volWindow?: VolatilityWindow;
  modelType?: string;
  kalshiImpliedProb?: number | null;
}): ProbabilityInputs {
  const volWindow = (opts.volWindow ?? 20) as VolatilityWindow;
  const calDays = opts.expirationDate ? daysUntil(opts.expirationDate) : 30;
  const tradingDays = calendarToTradingDays(calDays);

  return {
    priceHistory: opts.priceHistory,
    currentPrice: opts.currentPrice,
    strike: opts.strike,
    strikeDirection: opts.strikeDirection,
    daysToExpiry: calDays,
    tradingDaysToExpiry: tradingDays,
    volWindow,
    modelType: (opts.modelType as ProbabilityInputs['modelType']) ?? 'normal',
    kalshiImpliedProb: opts.kalshiImpliedProb ?? null,
    includeScenarioTable: true,
  };
}
