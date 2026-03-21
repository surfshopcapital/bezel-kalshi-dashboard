/**
 * Probability engine for Kalshi watch-price prediction markets.
 *
 * Implements four model types:
 *   - normal:             log-normal / GBM closed-form
 *   - empirical:          historical overlapping window counts
 *   - monte_carlo:        delegated to monteCarlo.ts
 *   - ornstein_uhlenbeck: delegated to monteCarlo.ts with OU flag
 */
import {
  computeLogReturns,
  stdDev,
  mean,
  annualizeVol,
  percentile,
  estimateDrift,
} from './volatility';
import { runMonteCarlo } from './monteCarlo';

import type {
  ProbabilityInputs,
  ProbabilityOutput,
  PercentileBand,
  ScenarioRow,
  StrikeDirection,
  VolatilityWindow,
  ProbabilityModelType,
} from '@/types';

export type { VolatilityWindow as VolWindow, ProbabilityModelType };

const TRADING_DAYS_PER_YEAR = 252;
const PERCENTILE_LEVELS = [5, 10, 25, 50, 75, 90, 95] as const;
const VOL_SCENARIO_ASSUMPTIONS = [0.02, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30] as const;

// ---------------------------------------------------------------------------
// Standard normal CDF — Abramowitz & Stegun 1964 §26.2.17
// ---------------------------------------------------------------------------

/**
 * Compute Φ(z), the standard normal CDF, using A&S polynomial approximation.
 * Maximum error: 7.5e-8.
 */
export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const absZ = Math.abs(z);
  const t = 1 / (1 + p * absZ);
  const poly =
    1 -
    (a1 * t + a2 * t ** 2 + a3 * t ** 3 + a4 * t ** 4 + a5 * t ** 5) *
      Math.exp(-(absZ ** 2) / 2);

  return z >= 0 ? poly : 1 - poly;
}

// ---------------------------------------------------------------------------
// Inverse normal CDF (probit) — rational approximation
// ---------------------------------------------------------------------------

/**
 * Compute Φ⁻¹(p), the probit function, using Peter Acklam's rational approximation.
 * Accurate to about 1.15e-9 for p in (0, 1).
 * Returns ±Infinity for p = 0 or p = 1.
 */
export function normalInvCdf(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  // Coefficients for the rational approximation
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
              1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
              6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
              -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
              3.754408661907416e0];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  let r: number;
  let x: number;

  if (p < pLow) {
    // Lower region
    q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    // Central region
    q = p - 0.5;
    r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    // Upper region
    q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
         ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  return x;
}

// ---------------------------------------------------------------------------
// Kalshi implied probability
// ---------------------------------------------------------------------------

/**
 * Convert a Kalshi YES price (in cents, 0–100) to a probability in [0, 1].
 * For 'above' contracts, impliedProb = yesPrice / 100.
 * For 'below' contracts, impliedProb = yesPrice / 100 (Kalshi markets are
 * structured so YES resolves to the stated condition).
 */
export function kalshiImpliedProbability(
  yesPrice: number,
  _strikeDirection: 'above' | 'below',
): number {
  return Math.min(1, Math.max(0, yesPrice / 100));
}

// ---------------------------------------------------------------------------
// Scenario table
// ---------------------------------------------------------------------------

/**
 * Compute a scenario table varying annualized vol assumptions.
 * For each vol in [0.02, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30]:
 *   - dailyVol = annVol / sqrt(252)
 *   - z = (log(strike/currentPrice) - driftPerDay * T) / (dailyVol * sqrt(T))
 *   - probBelow = normalCdf(z), probAbove = 1 - probBelow
 *   - oneSigmaMove = currentPrice * (exp(dailyVol * sqrt(T)) - 1)
 *   - expectedPrice = currentPrice * exp(driftPerDay * T)
 */
export function computeScenarioTable(
  currentPrice: number,
  strike: number,
  tradingDaysToExpiry: number,
  driftPerDay: number,
): ScenarioRow[] {
  const T = Math.max(1, tradingDaysToExpiry);
  const sqrtT = Math.sqrt(T);
  const logRatio = Math.log(strike / currentPrice);

  return VOL_SCENARIO_ASSUMPTIONS.map((annVol) => {
    const dailyVol = annVol / Math.sqrt(TRADING_DAYS_PER_YEAR);
    const denominator = dailyVol * sqrtT;
    const z = denominator > 0 ? (logRatio - driftPerDay * T) / denominator : (logRatio > 0 ? Infinity : -Infinity);
    const probBelow = normalCdf(z);
    const probAbove = 1 - probBelow;
    const oneSigmaMove = currentPrice * (Math.exp(dailyVol * sqrtT) - 1);
    const expectedPrice = currentPrice * Math.exp(driftPerDay * T);

    return {
      volAssumption: annVol,
      probAbove,
      probBelow,
      oneSigmaMove,
      expectedPrice,
    };
  });
}

// ---------------------------------------------------------------------------
// Percentile bands
// ---------------------------------------------------------------------------

/**
 * Compute price percentile bands under a log-normal assumption.
 * For percentile p: price = currentPrice * exp(driftPerDay*T + dailyVol*sqrt(T)*Φ⁻¹(p/100))
 */
export function computePercentileBands(
  currentPrice: number,
  dailyVol: number,
  driftPerDay: number,
  tradingDays: number,
  strike: number,
): PercentileBand[] {
  const T = Math.max(1, tradingDays);
  const sqrtT = Math.sqrt(T);

  return PERCENTILE_LEVELS.map((p) => {
    const z = normalInvCdf(p / 100);
    const price = currentPrice * Math.exp(driftPerDay * T + dailyVol * sqrtT * z);
    return {
      percentile: p,
      price,
      aboveStrike: price > strike,
    };
  });
}

// ---------------------------------------------------------------------------
// Confidence score
// ---------------------------------------------------------------------------

/**
 * Estimate a confidence score in [0, 1] for the probability estimate.
 *
 * - Degrades with small sample size (ramps up from 0 at n=0 to 1 at n=60)
 * - Degrades when daysToExpiry is large (uncertainty compounds over time):
 *   for daysToExpiry > 10, apply a discount that maxes out at -70% at 30+ days
 */
export function computeConfidenceScore(sampleSize: number, daysToExpiry: number): number {
  const sampleScore = Math.min(1, sampleSize / 60);
  const expiryPenalty = Math.max(0.3, 1 - 0.1 * Math.max(0, daysToExpiry - 10) / 20);
  return sampleScore * expiryPenalty;
}

// ---------------------------------------------------------------------------
// Normal (log-normal / GBM) model
// ---------------------------------------------------------------------------

/**
 * Closed-form probability under GBM / log-normal dynamics.
 *
 * Steps:
 *  1. Take last volWindow log-returns for vol estimation.
 *  2. Use all available log-returns for drift estimation.
 *  3. If |tStat| < 1.5, force drift = 0 (not statistically significant).
 *  4. Compute z-score for strike under log-normal distribution.
 *  5. Return full ProbabilityOutput (minus kalshiImpliedProb / modelEdge).
 */
export function normalModel(
  inputs: ProbabilityInputs,
): Omit<ProbabilityOutput, 'kalshiImpliedProb' | 'modelEdge'> {
  const {
    priceHistory,
    currentPrice,
    strike,
    strikeDirection,
    tradingDaysToExpiry,
    volWindow,
    includeScenarioTable,
  } = inputs;

  // All log-returns for drift
  const allLogReturns = computeLogReturns(priceHistory);

  // Last volWindow returns for vol
  const volSlice = allLogReturns.slice(-volWindow);
  const rawDailyVol = volSlice.length >= 2 ? stdDev(volSlice) : 0;
  const dailyVol = Math.max(0.01, rawDailyVol); // 1% floor

  // Drift: suppress if not statistically significant
  const driftInfo = estimateDrift(allLogReturns);
  const driftPerDay = driftInfo.isSignificant ? driftInfo.mean : 0;

  const annVol = annualizeVol(dailyVol);

  const T = Math.max(1, tradingDaysToExpiry);
  const sqrtT = Math.sqrt(T);

  // Log-normal z-score: P(S_T < strike)
  const logRatio = Math.log(strike / currentPrice);
  const denominator = dailyVol * sqrtT;
  const z = denominator > 0
    ? (logRatio - driftPerDay * T) / denominator
    : logRatio > 0 ? Infinity : -Infinity;

  const probBelow = normalCdf(z);
  const probAbove = 1 - probBelow;

  const expectedPrice = currentPrice * Math.exp(driftPerDay * T);
  const oneSigmaMove = currentPrice * (Math.exp(dailyVol * sqrtT) - 1);
  const distanceToStrike = currentPrice - strike;
  const distanceToStrikeSigmas = oneSigmaMove !== 0 ? distanceToStrike / oneSigmaMove : 0;

  const percentileBands = computePercentileBands(
    currentPrice, dailyVol, driftPerDay, T, strike,
  );
  const scenarioTable = (includeScenarioTable ?? true)
    ? computeScenarioTable(currentPrice, strike, T, driftPerDay)
    : [];

  const confidenceScore = computeConfidenceScore(allLogReturns.length, inputs.daysToExpiry);

  return {
    modelType: 'normal' as ProbabilityModelType,
    currentPrice,
    strike,
    strikeDirection,
    daysToExpiry: inputs.daysToExpiry,
    volWindow,
    realizedDailyVol: dailyVol,
    annualizedVol: annVol,
    probabilityAbove: probAbove,
    probabilityBelow: probBelow,
    expectedPriceAtExpiry: expectedPrice,
    oneSigmaMove,
    distanceToStrike,
    distanceToStrikeSigmas,
    percentileBands,
    scenarioTable,
    confidenceScore,
    mcPaths: null,
  };
}

// ---------------------------------------------------------------------------
// Empirical model
// ---------------------------------------------------------------------------

/**
 * Empirical probability using historical T-day overlapping windows.
 *
 * For each window of length T in priceHistory, record whether the ending
 * price is above or below strike relative to the starting price's ratio.
 * The fraction of windows where price ends above/below is the empirical
 * probability.
 *
 * If insufficient history for even one T-day window, falls back to normalModel.
 */
export function empiricalModel(
  inputs: ProbabilityInputs,
): Omit<ProbabilityOutput, 'kalshiImpliedProb' | 'modelEdge'> {
  const {
    priceHistory,
    currentPrice,
    strike,
    strikeDirection,
    tradingDaysToExpiry,
    volWindow,
    includeScenarioTable,
  } = inputs;

  const T = Math.max(1, tradingDaysToExpiry);
  const n = priceHistory.length;

  // Need at least T+1 prices for one overlapping window
  if (n < T + 1) {
    // Fall back to normal model
    return normalModel(inputs);
  }

  // Collect terminal prices for each overlapping T-day window
  const allLogReturns = computeLogReturns(priceHistory);
  const terminalPrices: number[] = [];

  for (let start = 0; start + T < n; start++) {
    const startPrice = priceHistory[start];
    if (!Number.isFinite(startPrice) || startPrice <= 0) continue;
    // Compound log-returns from start to start+T
    const windowReturns = allLogReturns.slice(start, start + T);
    const totalLogReturn = windowReturns
      .filter(Number.isFinite)
      .reduce((sum, r) => sum + r, 0);
    // Scale to current price
    const scaledTerminal = currentPrice * Math.exp(totalLogReturn);
    terminalPrices.push(scaledTerminal);
  }

  if (terminalPrices.length === 0) {
    return normalModel(inputs);
  }

  const countAbove = terminalPrices.filter((p) => p > strike).length;
  const probAbove = countAbove / terminalPrices.length;
  const probBelow = 1 - probAbove;

  // Vol and drift from log-returns for reporting
  const volSlice = allLogReturns.slice(-volWindow);
  const dailyVol = Math.max(0.01, volSlice.length >= 2 ? stdDev(volSlice) : 0);
  const annVol = annualizeVol(dailyVol);
  const driftInfo = estimateDrift(allLogReturns);
  const driftPerDay = driftInfo.isSignificant ? driftInfo.mean : 0;

  const sqrtT = Math.sqrt(T);
  const expectedPrice = currentPrice * Math.exp(driftPerDay * T);
  const oneSigmaMove = currentPrice * (Math.exp(dailyVol * sqrtT) - 1);
  const distanceToStrike = currentPrice - strike;
  const distanceToStrikeSigmas = oneSigmaMove !== 0 ? distanceToStrike / oneSigmaMove : 0;

  const percentileBands = computePercentileBands(
    currentPrice, dailyVol, driftPerDay, T, strike,
  );
  const scenarioTable = (includeScenarioTable ?? true)
    ? computeScenarioTable(currentPrice, strike, T, driftPerDay)
    : [];

  const confidenceScore = computeConfidenceScore(terminalPrices.length, inputs.daysToExpiry);

  return {
    modelType: 'empirical' as ProbabilityModelType,
    currentPrice,
    strike,
    strikeDirection,
    daysToExpiry: inputs.daysToExpiry,
    volWindow,
    realizedDailyVol: dailyVol,
    annualizedVol: annVol,
    probabilityAbove: probAbove,
    probabilityBelow: probBelow,
    expectedPriceAtExpiry: expectedPrice,
    oneSigmaMove,
    distanceToStrike,
    distanceToStrikeSigmas,
    percentileBands,
    scenarioTable,
    confidenceScore,
    mcPaths: null,
  };
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

/**
 * Compute the probability that a watch price ends above or below the given
 * strike at expiry. Dispatches to the appropriate sub-model.
 *
 * If kalshiYesPrice is provided (0–100 cents), also computes:
 *   - kalshiImpliedProb: yesPrice / 100
 *   - modelEdge: modelProb(direction) - kalshiImpliedProb
 */
export function computeProbability(
  inputs: ProbabilityInputs,
  kalshiYesPrice?: number,
): ProbabilityOutput {
  let base: Omit<ProbabilityOutput, 'kalshiImpliedProb' | 'modelEdge'>;

  const { modelType, strikeDirection, tradingDaysToExpiry, mcPaths } = inputs;

  switch (modelType) {
    case 'normal':
      base = normalModel(inputs);
      break;

    case 'empirical':
      base = empiricalModel(inputs);
      break;

    case 'monte_carlo':
    case 'ornstein_uhlenbeck': {
      // Compute vol and drift for MC inputs
      const allLogReturns = computeLogReturns(inputs.priceHistory);
      const volSlice = allLogReturns.slice(-inputs.volWindow);
      const dailyVol = Math.max(0.01, volSlice.length >= 2 ? stdDev(volSlice) : 0);
      const driftInfo = estimateDrift(allLogReturns);
      const driftPerDay = driftInfo.isSignificant ? driftInfo.mean : 0;

      const mcResult = runMonteCarlo({
        currentPrice: inputs.currentPrice,
        strike: inputs.strike,
        strikeDirection: inputs.strikeDirection,
        tradingDaysToExpiry: Math.max(1, tradingDaysToExpiry),
        dailyVol,
        driftPerDay,
        numPaths: mcPaths ?? 10_000,
        useOU: modelType === 'ornstein_uhlenbeck',
        ouTheta: 0.1,
        ouMu: inputs.currentPrice,
      });

      const annVol = annualizeVol(dailyVol);
      const T = Math.max(1, tradingDaysToExpiry);
      const sqrtT = Math.sqrt(T);
      const oneSigmaMove = inputs.currentPrice * (Math.exp(dailyVol * sqrtT) - 1);
      const distanceToStrike = inputs.currentPrice - inputs.strike;
      const distanceToStrikeSigmas = oneSigmaMove !== 0 ? distanceToStrike / oneSigmaMove : 0;

      const percentileBands = computePercentileBands(
        inputs.currentPrice, dailyVol, driftPerDay, T, inputs.strike,
      );
      const scenarioTable = (inputs.includeScenarioTable ?? true)
        ? computeScenarioTable(inputs.currentPrice, inputs.strike, T, driftPerDay)
        : [];

      const confidenceScore = computeConfidenceScore(allLogReturns.length, inputs.daysToExpiry);

      base = {
        modelType: modelType as ProbabilityModelType,
        currentPrice: inputs.currentPrice,
        strike: inputs.strike,
        strikeDirection: inputs.strikeDirection,
        daysToExpiry: inputs.daysToExpiry,
        volWindow: inputs.volWindow,
        realizedDailyVol: dailyVol,
        annualizedVol: annVol,
        probabilityAbove: mcResult.probabilityAbove,
        probabilityBelow: mcResult.probabilityBelow,
        expectedPriceAtExpiry: mcResult.expectedPrice,
        oneSigmaMove,
        distanceToStrike,
        distanceToStrikeSigmas,
        percentileBands,
        scenarioTable,
        confidenceScore,
        mcPaths: mcResult.numPaths,
      };
      break;
    }

    default:
      base = normalModel(inputs);
  }

  // Kalshi edge computation
  let kalshiImpliedProb: number | null = null;
  let modelEdge: number | null = null;

  if (kalshiYesPrice !== undefined && Number.isFinite(kalshiYesPrice)) {
    kalshiImpliedProb = kalshiImpliedProbability(kalshiYesPrice, strikeDirection);
    const modelProb =
      strikeDirection === 'above' ? base.probabilityAbove : base.probabilityBelow;
    modelEdge = modelProb - kalshiImpliedProb;
  }

  return { ...base, kalshiImpliedProb, modelEdge };
}
