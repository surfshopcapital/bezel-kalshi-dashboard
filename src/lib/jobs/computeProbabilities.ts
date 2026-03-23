/**
 * Compute and persist probability model outputs for all tracked markets.
 *
 * For each market mapping:
 *   1. Load Bezel price history (most recent volWindow + buffer prices)
 *   2. Load latest Kalshi snapshot for implied probability
 *   3. Build model inputs (strike, direction, days to expiry)
 *   4. Run the normal model
 *   5. Persist the ProbabilityRun to the database
 *
 * Markets with fewer than MIN_DATA_POINTS price observations are skipped.
 */
import { getAllMappings } from '@/lib/mappings';
import {
  getBezelPriceHistory,
  getLatestKalshiSnapshot,
  appendProbabilityRun,
  startIngestionLog,
  finishIngestionLog,
  getKalshiMarketByTicker,
  getBezelEntityBySlug,
} from '@/lib/db/queries';
import {
  normalModel,
  buildProbabilityInputs,
} from '@/lib/probability/engine';
import { createChildLogger } from '@/lib/utils/logger';
import type { StrikeDirection, VolatilityWindow } from '@/types';

const log = createChildLogger({ job: 'computeProbabilities' });

const MIN_DATA_POINTS = 5;
const DEFAULT_VOL_WINDOW: VolatilityWindow = 20;
const DEFAULT_LOOKBACK_DAYS = 90;
// How many raw DB rows to fetch. Must be large enough to cover the full
// lookback window even at max polling frequency (15-min = 96 rows/day).
// 90 days × 100 rows/day-buffer = 9,000 — well above the 96/day worst case.
const HISTORY_FETCH_LIMIT = DEFAULT_LOOKBACK_DAYS * 100;

export interface ProbabilitiesResult {
  computed: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function computeProbabilitiesJob(): Promise<ProbabilitiesResult> {
  const result: ProbabilitiesResult = { computed: 0, skipped: 0, failed: 0, errors: [] };
  const mappings = getAllMappings();

  log.info('Starting probability computation', { mappingCount: mappings.length });

  for (const mapping of mappings) {
    const ingestionLog = await startIngestionLog(
      'computeProbabilities',
      'internal',
      undefined,
      mapping.kalshiTicker,
    );

    try {
      // Load the Kalshi market record (includes mapping + bezel entity linkage)
      const kalshiMarket = await getKalshiMarketByTicker(mapping.kalshiTicker);
      if (!kalshiMarket) {
        const msg = `KalshiMarket not found for ticker: ${mapping.kalshiTicker}`;
        log.warn(msg);
        await finishIngestionLog(ingestionLog.id, 'partial', 0, msg);
        result.skipped++;
        continue;
      }

      // Load the Bezel entity
      const bezelEntity = await getBezelEntityBySlug(mapping.bezelSlug);
      if (!bezelEntity) {
        const msg = `BezelEntity not found for slug: ${mapping.bezelSlug}`;
        log.warn(msg);
        await finishIngestionLog(ingestionLog.id, 'partial', 0, msg);
        result.skipped++;
        continue;
      }

      // Load price history — use a generous row limit so we capture all daily
      // prices in the lookback window regardless of polling frequency.
      const since = new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      const history = await getBezelPriceHistory(bezelEntity.slug, HISTORY_FETCH_LIMIT, since);

      // ── Daily deduplication ───────────────────────────────────────────────
      // Bezel publishes one new price per day (~8 PM ET for indexes, ~1 AM ET
      // for models). Polling every 15 minutes creates many snapshots with
      // identical prices. Feeding those into the vol calculation produces
      // log-returns of zero → vol ≈ 0 → probability collapses to 0% or 100%.
      //
      // Fix: keep only the FIRST snapshot seen per calendar day (history is
      // already sorted oldest→newest by getBezelPriceHistory). This gives us
      // genuine daily price moves for vol estimation.
      const seenDates = new Set<string>();
      const dailyHistory = history.filter((snap) => {
        const dateKey = snap.capturedAt.toISOString().slice(0, 10); // YYYY-MM-DD UTC
        if (seenDates.has(dateKey)) return false;
        seenDates.add(dateKey);
        return true;
      });

      log.info('Price history loaded', {
        ticker: mapping.kalshiTicker,
        rawSnapshots: history.length,
        dailyPrices: dailyHistory.length,
      });

      if (dailyHistory.length < MIN_DATA_POINTS) {
        const msg = `Insufficient data (${dailyHistory.length} daily points, need ${MIN_DATA_POINTS}) for ${mapping.bezelSlug}`;
        log.info(msg);
        await finishIngestionLog(ingestionLog.id, 'partial', 0, msg);
        result.skipped++;
        continue;
      }

      const priceHistory = dailyHistory.map((h) => h.price);
      const currentPrice = priceHistory[priceHistory.length - 1];

      // Resolve strike — prefer the mapping config, then fall back to the market's parsed strike
      const strike =
        mapping.strikeValue ??
        kalshiMarket.resolvedStrike ??
        null;

      if (strike === null || strike <= 0) {
        const msg = `No valid strike for ${mapping.kalshiTicker}`;
        log.warn(msg);
        await finishIngestionLog(ingestionLog.id, 'partial', 0, msg);
        result.skipped++;
        continue;
      }

      const strikeDirection: StrikeDirection =
        (mapping.strikeDirection as StrikeDirection) ??
        (kalshiMarket.strikeDirection as StrikeDirection) ??
        'above';

      // Load latest Kalshi snapshot for implied probability
      const latestSnap = await getLatestKalshiSnapshot(kalshiMarket.ticker);
      const kalshiImpliedProb = latestSnap?.impliedProb ?? null;

      // Build model inputs
      const inputs = buildProbabilityInputs({
        priceHistory,
        currentPrice,
        strike,
        strikeDirection,
        expirationDate: kalshiMarket.expirationDate ?? kalshiMarket.closeDate,
        volWindow: DEFAULT_VOL_WINDOW,
        modelType: 'normal',
        kalshiImpliedProb,
      });

      // Run probability model
      const output = normalModel(inputs);

      // Persist the run
      await appendProbabilityRun({
        marketId: kalshiMarket.id,
        mappingId: kalshiMarket.mapping?.id,
        currentLevel: output.currentPrice,
        strike: output.strike,
        strikeDirection: output.strikeDirection,
        daysToExpiry: output.daysToExpiry,
        volWindow: output.volWindow,
        realizedVol: output.realizedDailyVol,
        annualizedVol: output.annualizedVol,
        probabilityAbove: output.probabilityAbove,
        probabilityBelow: output.probabilityBelow,
        expectedPriceAtExpiry: output.expectedPriceAtExpiry,
        oneSigmaMove: output.oneSigmaMove,
        kalshiImpliedProb: output.kalshiImpliedProb,
        modelEdge: output.modelEdge,
        confidenceScore: output.confidenceScore,
        modelType: output.modelType,
        mcPaths: output.mcPaths,
        percentileBands: output.percentileBands as unknown as import('@prisma/client').Prisma.InputJsonValue,
        scenarioTable: output.scenarioTable as unknown as import('@prisma/client').Prisma.InputJsonValue,
        inputParams: {
          priceHistoryLength: priceHistory.length,
          rawSnapshotCount: history.length,
          volWindow: inputs.volWindow,
          modelType: inputs.modelType,
        },
      });

      await finishIngestionLog(ingestionLog.id, 'success', 1);
      result.computed++;

      log.info('Probability computed', {
        ticker: mapping.kalshiTicker,
        modelProb: strikeDirection === 'above' ? output.probabilityAbove : output.probabilityBelow,
        kalshiImpliedProb,
        modelEdge: output.modelEdge,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('Failed to compute probability', {
        ticker: mapping.kalshiTicker,
        error: msg,
      });
      await finishIngestionLog(ingestionLog.id, 'failed', 0, msg);
      result.failed++;
      result.errors.push(`${mapping.kalshiTicker}: ${msg}`);
    }
  }

  log.info('Probability computation complete', result);
  return result;
}
