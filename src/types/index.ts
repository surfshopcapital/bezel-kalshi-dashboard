/**
 * Global TypeScript types for the Bezel-Kalshi dashboard.
 * Shared across API routes, lib modules, and UI components.
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export type DataSourceQuality =
  | 'official_api'
  | 'frontend_network_capture'
  | 'html_scrape'
  | 'manual_mapping_fallback';

export type BezelEntityType = 'index' | 'model';

export type ProbabilityModelType = 'normal' | 'empirical' | 'monte_carlo' | 'ornstein_uhlenbeck';

export type VolatilityWindow = 5 | 10 | 20 | 30 | 60;

export type StrikeDirection = 'above' | 'below';

// ---------------------------------------------------------------------------
// Kalshi types
// ---------------------------------------------------------------------------

export interface KalshiOrderbookLevel {
  price: number;    // cents (0–100)
  quantity: number; // number of contracts
}

export interface KalshiNormalizedOrderbook {
  marketTicker: string;
  yesBids: KalshiOrderbookLevel[];
  noBids: KalshiOrderbookLevel[];
  bestYesBid: number | null;
  bestNoBid: number | null;
  /** Implied ask price for YES = 100 - bestNoBid */
  impliedYesAsk: number | null;
  spread: number | null;
  midpoint: number | null;
  capturedAt: string;
}

export interface KalshiNormalizedMarket {
  ticker: string;
  eventTicker: string | null;
  seriesTicker: string | null;
  title: string;
  subtitle: string | null;
  status: string;
  expirationDate: Date | null;
  closeDate: Date | null;
  rulesText: string | null;
  yesPrice: number;      // mid of yes_bid/yes_ask, in cents
  noPrice: number;       // mid of no_bid/no_ask, in cents
  volume: number;
  openInterest: number | null;
  lastPrice: number | null;
  impliedProb: number;   // [0,1] derived from yesPrice/100
  resolvedStrike: number | null;
  strikeDirection: StrikeDirection | null;
  strikeCondition: string | null;
  kalshiUrl: string;
}

// ---------------------------------------------------------------------------
// Bezel types
// ---------------------------------------------------------------------------

export interface BezelPricePoint {
  date: string;       // ISO date string
  price: number;
  change: number | null;
  changePct: number | null;
  quality: DataSourceQuality;
}

export interface BezelEntitySummary {
  slug: string;
  entityType: BezelEntityType;
  name: string;
  brand: string | null;
  referenceNumber: string | null;
  bezelUrl: string;
  latestPrice: number | null;
  latestChange: number | null;
  latestChangePct: number | null;
  lastUpdated: string | null;
  dataSourceQuality: DataSourceQuality | null;
}

// ---------------------------------------------------------------------------
// Market mapping
// ---------------------------------------------------------------------------

export interface MarketMappingDetail {
  id: string;
  kalshiTicker: string;
  bezelSlug: string;
  bezelEntityType: BezelEntityType;
  strikeValue: number | null;
  strikeDirection: StrikeDirection | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Probability model
// ---------------------------------------------------------------------------

export interface ProbabilityInputs {
  priceHistory: number[];
  currentPrice: number;
  strike: number;
  strikeDirection: StrikeDirection;
  daysToExpiry: number;
  tradingDaysToExpiry: number;
  volWindow: VolatilityWindow;
  modelType: ProbabilityModelType;
  kalshiImpliedProb?: number | null;
  mcPaths?: number;
  includeScenarioTable?: boolean;
}

export interface PercentileBand {
  percentile: number;   // e.g. 5, 10, 25, 50, 75, 90, 95
  price: number;
  aboveStrike: boolean;
}

export interface ScenarioRow {
  volAssumption: number;  // annualized vol (e.g. 0.05 = 5%)
  probAbove: number;      // [0, 1]
  probBelow: number;      // [0, 1]
  oneSigmaMove: number;   // dollar amount of 1-sigma move
  expectedPrice: number;
}

export interface ProbabilityOutput {
  modelType: ProbabilityModelType;
  currentPrice: number;
  strike: number;
  strikeDirection: StrikeDirection;
  daysToExpiry: number;
  volWindow: VolatilityWindow;
  realizedDailyVol: number;
  annualizedVol: number;
  probabilityAbove: number;
  probabilityBelow: number;
  expectedPriceAtExpiry: number;
  oneSigmaMove: number;
  distanceToStrike: number;        // currentPrice - strike (signed)
  distanceToStrikeSigmas: number;  // (currentPrice - strike) / oneSigmaMove
  percentileBands: PercentileBand[];
  scenarioTable: ScenarioRow[];
  confidenceScore: number;         // [0, 1]
  kalshiImpliedProb: number | null;
  modelEdge: number | null;        // modelProb(direction) - kalshiImpliedProb(direction)
  mcPaths: number | null;
}

// ---------------------------------------------------------------------------
// Correlation
// ---------------------------------------------------------------------------

export interface CorrelationPair {
  entity1Id: string;
  entity1Name: string;
  entity2Id: string;
  entity2Name: string;
  lookbackDays: number;
  correlation: number | null;
  lagDays: number;
  regime: string | null;
  sampleSize: number;
}

export interface CorrelationMatrix {
  ids: string[];
  names: string[];
  matrix: (number | null)[][];
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Dashboard card (aggregate view)
// ---------------------------------------------------------------------------

export interface DashboardMarketCard {
  // Kalshi
  ticker: string;
  title: string;
  status: string;
  kalshiUrl: string;
  expirationDate: string | null;
  yesPrice: number | null;
  noPrice: number | null;
  volume: number | null;
  impliedProb: number | null;
  // Bezel
  bezelSlug: string | null;
  bezelUrl: string | null;
  bezelEntityType: BezelEntityType | null;
  brand: string | null;
  currentBezelPrice: number | null;
  bezelDailyChange: number | null;
  bezelDailyChangePct: number | null;
  bezelPriceHistory: number[];
  dataSourceQuality: DataSourceQuality | null;
  lastBezelUpdate: string | null;
  // Strike
  strikeValue: number | null;
  strikeDirection: StrikeDirection | null;
  distanceToStrike: number | null;
  distanceToStrikeSigmas: number | null;
  // Model
  modeledProbability: number | null;     // model prob in the direction of the contract
  kalshiImpliedProb: number | null;
  modelEdge: number | null;
  confidenceScore: number | null;
  lastModelRun: string | null;
}

// ---------------------------------------------------------------------------
// Ingestion log
// ---------------------------------------------------------------------------

export interface IngestionLogEntry {
  id: string;
  jobName: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  sourceType: string;
  entityTicker: string | null;
  recordsWritten: number | null;
  errorMessage: string | null;
}

// ---------------------------------------------------------------------------
// API response wrapper
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  data: T;
  meta?: {
    count?: number;
    timestamp: string;
    responseTimeMs?: number;
  };
}

export interface ApiError {
  error: string;
  details?: unknown;
}
