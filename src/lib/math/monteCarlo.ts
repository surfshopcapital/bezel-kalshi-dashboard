/**
 * Monte Carlo simulation engine for watch price prediction markets.
 *
 * Supports:
 *   - Standard GBM (geometric Brownian motion) paths
 *   - Ornstein-Uhlenbeck (mean-reverting) paths via Euler-Maruyama
 *   - Deterministic seeding via LCG random number generator
 *   - Box-Muller normal variate generation
 */

export interface MCInputs {
  /** Current watch price */
  currentPrice: number;
  /** Strike price of the Kalshi market */
  strike: number;
  /** Direction of the contract */
  strikeDirection: 'above' | 'below';
  /** Number of trading days until expiry (dt = 1 day) */
  tradingDaysToExpiry: number;
  /** Daily volatility (e.g. 0.01 = 1% per day) */
  dailyVol: number;
  /** Daily log-return drift */
  driftPerDay: number;
  /** Number of Monte Carlo paths (default: 10 000) */
  numPaths?: number;
  /** Optional seed for reproducibility (uses LCGRandom) */
  seed?: number;
  /** If true, simulate OU (mean-reverting) paths instead of GBM */
  useOU?: boolean;
  /** OU speed-of-reversion parameter (κ) */
  ouTheta?: number;
  /** OU long-run mean (μ) */
  ouMu?: number;
}

export interface MCOutput {
  probabilityAbove: number;
  probabilityBelow: number;
  expectedPrice: number;
  medianPrice: number;
  /** Prices at selected percentiles: keys are percentile integers 5,10,25,50,75,90,95 */
  percentiles: Record<number, number>;
  /** Approximate 1-sigma upper bound ≈ 90th percentile */
  oneSigmaUp: number;
  /** Approximate 1-sigma lower bound ≈ 10th percentile */
  oneSigmaDown: number;
  numPaths: number;
  /** Optional: all simulated terminal prices (only returned if returnPaths=true) */
  simulatedPaths?: number[];
}

// ---------------------------------------------------------------------------
// Linear Congruential Generator — for deterministic seeding
// ---------------------------------------------------------------------------

/**
 * A simple, fast LCG pseudo-random number generator.
 * Parameters: a=1664525, c=1013904223, m=2^32 (Numerical Recipes).
 */
export class LCGRandom {
  private state: number;

  constructor(seed: number) {
    // Force unsigned 32-bit integer
    this.state = seed >>> 0;
  }

  /** Returns a pseudo-random number in [0, 1) */
  next(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 4294967296; // 2^32
  }

  /**
   * Returns a standard normal variate using Box-Muller transform.
   * Uses two successive LCG samples.
   */
  nextNormal(): number {
    // Ensure u1 > 0 to avoid log(0)
    const u1 = Math.max(1e-10, this.next());
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

// ---------------------------------------------------------------------------
// Box-Muller transform
// ---------------------------------------------------------------------------

/**
 * Transform two uniform [0, 1) variates (u1, u2) into two independent
 * standard normal variates using the Box-Muller method.
 * Clamps u1 away from 0 to prevent log(0).
 */
export function boxMullerNormal(u1: number, u2: number): [number, number] {
  const safeU1 = Math.max(1e-300, u1);
  const r = Math.sqrt(-2 * Math.log(safeU1));
  const theta = 2 * Math.PI * u2;
  return [r * Math.cos(theta), r * Math.sin(theta)];
}

// ---------------------------------------------------------------------------
// Percentile helper (internal)
// ---------------------------------------------------------------------------

function sortedPercentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[n - 1];
  const index = (p / 100) * (n - 1);
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (index - lo) * (sorted[hi] - sorted[lo]);
}

// ---------------------------------------------------------------------------
// Main simulation
// ---------------------------------------------------------------------------

const PERCENTILE_LEVELS = [5, 10, 25, 50, 75, 90, 95] as const;
const DEFAULT_NUM_PATHS = 10_000;

/**
 * Run a Monte Carlo simulation and return aggregate statistics over terminal prices.
 *
 * GBM dynamics (per step, dt = 1 day):
 *   P[t+1] = P[t] * exp((drift - 0.5 * vol²) * dt + vol * sqrt(dt) * Z)
 *   where Z ~ N(0, 1)
 *
 * OU dynamics (Euler-Maruyama):
 *   dP = ouTheta * (ouMu - P[t]) * dt + vol * P[t] * Z * sqrt(dt)
 *   P[t+1] = P[t] + dP
 *   Price is clamped to a minimum of 0.01 to prevent negative values.
 *
 * @param inputs   Simulation parameters
 * @param returnPaths  If true, include all terminal prices in the output
 */
export function runMonteCarlo(inputs: MCInputs, returnPaths?: boolean): MCOutput {
  const {
    currentPrice,
    strike,
    tradingDaysToExpiry,
    dailyVol,
    driftPerDay,
    useOU = false,
    ouTheta = 0.1,
    ouMu = currentPrice,
  } = inputs;

  const numPaths = inputs.numPaths ?? DEFAULT_NUM_PATHS;
  const T = Math.max(1, tradingDaysToExpiry);
  const dt = 1; // one trading day per step
  const sqrtDt = Math.sqrt(dt);
  const vol = Math.max(1e-6, dailyVol);

  // GBM drift adjustment: (drift - 0.5 * vol^2) * dt
  const gbmDriftAdj = (driftPerDay - 0.5 * vol * vol) * dt;

  // Random number source
  const useLCG = inputs.seed !== undefined;
  const lcg = useLCG ? new LCGRandom(inputs.seed as number) : null;

  // Pool of spare normals from Box-Muller (generates pairs)
  let spareNormal: number | null = null;

  function nextNormal(): number {
    if (lcg) {
      return lcg.nextNormal();
    }
    // Math.random() with Box-Muller, caching the spare variate
    if (spareNormal !== null) {
      const val = spareNormal;
      spareNormal = null;
      return val;
    }
    const [z1, z2] = boxMullerNormal(Math.random(), Math.random());
    spareNormal = z2;
    return z1;
  }

  // Simulate terminal prices
  const terminalPrices = new Float64Array(numPaths);

  for (let path = 0; path < numPaths; path++) {
    let price = currentPrice;

    if (useOU) {
      // Ornstein-Uhlenbeck: dP = θ(μ - P)dt + σ * P * Z * sqrt(dt)
      for (let t = 0; t < T; t++) {
        const Z = nextNormal();
        const dP = ouTheta * (ouMu - price) * dt + vol * price * Z * sqrtDt;
        price = Math.max(0.01, price + dP);
      }
    } else {
      // GBM: P[t+1] = P[t] * exp((drift - 0.5*vol²)*dt + vol*sqrt(dt)*Z)
      for (let t = 0; t < T; t++) {
        const Z = nextNormal();
        price = price * Math.exp(gbmDriftAdj + vol * sqrtDt * Z);
      }
    }

    terminalPrices[path] = price;
  }

  // Aggregate statistics
  let sumPrice = 0;
  let countAbove = 0;

  for (let i = 0; i < numPaths; i++) {
    const p = terminalPrices[i];
    sumPrice += p;
    if (p > strike) countAbove++;
  }

  const probabilityAbove = countAbove / numPaths;
  const probabilityBelow = 1 - probabilityAbove;
  const expectedPrice = sumPrice / numPaths;

  // Sort for percentile computation
  const sorted = Array.from(terminalPrices).sort((a, b) => a - b);

  const percentilesResult: Record<number, number> = {};
  for (const p of PERCENTILE_LEVELS) {
    percentilesResult[p] = sortedPercentile(sorted, p);
  }

  const medianPrice = percentilesResult[50];
  const oneSigmaUp = percentilesResult[90];
  const oneSigmaDown = percentilesResult[10];

  const output: MCOutput = {
    probabilityAbove,
    probabilityBelow,
    expectedPrice,
    medianPrice,
    percentiles: percentilesResult,
    oneSigmaUp,
    oneSigmaDown,
    numPaths,
  };

  if (returnPaths) {
    output.simulatedPaths = Array.from(terminalPrices);
  }

  return output;
}
