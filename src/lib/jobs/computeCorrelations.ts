/**
 * Compute and persist pairwise correlations for all tracked Bezel entities.
 *
 * For each lookback window in [7, 14, 30, 60, 90] days:
 *   - Load price history for every BezelEntity
 *   - Align the two series on calendar date
 *   - Compute Pearson correlation of log returns
 *   - Persist via appendCorrelationMetrics
 *
 * Pairs with fewer than MIN_OVERLAP_POINTS aligned observations are skipped.
 */
import { prisma } from '@/lib/db';
import {
  getBezelPriceHistory,
  appendCorrelationMetrics,
  startIngestionLog,
  finishIngestionLog,
} from '@/lib/db/queries';
import type { CorrelationMetricData } from '@/lib/db/queries';
import { createChildLogger } from '@/lib/utils/logger';

const log = createChildLogger({ job: 'computeCorrelations' });

const LOOKBACK_DAYS = [7, 14, 30, 60, 90] as const;
const MIN_OVERLAP_POINTS = 5;

export interface CorrelationsResult {
  pairsComputed: number;
  pairsSkipped: number;
  failed: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

/** Compute log returns from an ordered price array. */
function logReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    const curr = prices[i];
    if (prev > 0 && curr > 0) {
      returns.push(Math.log(curr / prev));
    } else {
      returns.push(0);
    }
  }
  return returns;
}

/** Pearson correlation coefficient between two equal-length arrays. */
function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;

  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  const denom = Math.sqrt(varX * varY);
  if (denom === 0) return null;
  return cov / denom;
}

/**
 * Classify a correlation value into a descriptive regime string.
 */
function classifyRegime(correlation: number | null): string | null {
  if (correlation === null) return null;
  const abs = Math.abs(correlation);
  if (abs >= 0.8) return correlation >= 0 ? 'strong_positive' : 'strong_negative';
  if (abs >= 0.5) return correlation >= 0 ? 'moderate_positive' : 'moderate_negative';
  if (abs >= 0.2) return correlation >= 0 ? 'weak_positive' : 'weak_negative';
  return 'uncorrelated';
}

// ---------------------------------------------------------------------------
// Date-keyed price alignment
// ---------------------------------------------------------------------------

type DatePriceMap = Map<string, number>; // ISO date string → price

function buildDatePriceMap(
  history: { capturedAt: Date; price: number }[],
): DatePriceMap {
  const map = new Map<string, number>();
  for (const row of history) {
    // Use date-only key (UTC)
    const key = row.capturedAt.toISOString().slice(0, 10);
    // If multiple snapshots per day, keep the last one (already ordered asc)
    map.set(key, row.price);
  }
  return map;
}

/**
 * Intersect two date-price maps and return paired price arrays.
 * Only dates present in both maps are included.
 */
function alignSeries(
  map1: DatePriceMap,
  map2: DatePriceMap,
): { prices1: number[]; prices2: number[] } {
  const prices1: number[] = [];
  const prices2: number[] = [];

  const sortedDates = [...map1.keys()].sort();
  for (const date of sortedDates) {
    const p2 = map2.get(date);
    if (p2 !== undefined) {
      prices1.push(map1.get(date)!);
      prices2.push(p2);
    }
  }
  return { prices1, prices2 };
}

// ---------------------------------------------------------------------------
// Main job
// ---------------------------------------------------------------------------

export async function computeCorrelationsJob(): Promise<CorrelationsResult> {
  const result: CorrelationsResult = {
    pairsComputed: 0,
    pairsSkipped: 0,
    failed: 0,
    errors: [],
  };

  const ingestionLog = await startIngestionLog('computeCorrelations', 'internal');

  try {
    // Load all BezelEntity records
    const entities = await prisma.bezelEntity.findMany({
      select: { id: true, slug: true, entityType: true },
      orderBy: { slug: 'asc' },
    });

    if (entities.length < 2) {
      log.info('Not enough entities for correlation computation', {
        entityCount: entities.length,
      });
      await finishIngestionLog(ingestionLog.id, 'partial', 0, 'Need at least 2 entities');
      return result;
    }

    log.info('Starting correlation computation', {
      entityCount: entities.length,
      lookbacks: LOOKBACK_DAYS,
    });

    // For each lookback window, load histories and compute all pairwise correlations
    const metricsToInsert: CorrelationMetricData[] = [];

    for (const lookback of LOOKBACK_DAYS) {
      const since = new Date(Date.now() - lookback * 24 * 60 * 60 * 1000);

      // Load history for all entities for this lookback window
      const historyByEntity = new Map<string, DatePriceMap>();
      for (const entity of entities) {
        const history = await getBezelPriceHistory(entity.slug, 500, since);
        historyByEntity.set(entity.id, buildDatePriceMap(history));
      }

      // Compute pairwise
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const e1 = entities[i];
          const e2 = entities[j];

          const map1 = historyByEntity.get(e1.id)!;
          const map2 = historyByEntity.get(e2.id)!;

          const { prices1, prices2 } = alignSeries(map1, map2);

          if (prices1.length < MIN_OVERLAP_POINTS) {
            log.debug('Skipping pair: insufficient overlap', {
              e1: e1.slug,
              e2: e2.slug,
              lookback,
              overlap: prices1.length,
            });
            result.pairsSkipped++;
            continue;
          }

          // Compute correlation on log returns
          const rets1 = logReturns(prices1);
          const rets2 = logReturns(prices2);

          const correlation = pearsonCorrelation(rets1, rets2);
          if (correlation === null) {
            result.pairsSkipped++;
            continue;
          }

          const regime = classifyRegime(correlation);

          metricsToInsert.push({
            entity1Id: e1.id,
            entity2Id: e2.id,
            entity1Type: e1.entityType,
            entity2Type: e2.entityType,
            lookbackDays: lookback,
            correlation,
            lagDays: 0,
            regime,
            sampleSize: rets1.length,
          });

          result.pairsComputed++;
          log.debug('Correlation computed', {
            e1: e1.slug,
            e2: e2.slug,
            lookback,
            correlation: correlation.toFixed(4),
            regime,
          });
        }
      }
    }

    // Bulk insert all metrics
    if (metricsToInsert.length > 0) {
      await appendCorrelationMetrics(metricsToInsert);
      log.info('Correlation metrics persisted', { count: metricsToInsert.length });
    }

    await finishIngestionLog(ingestionLog.id, 'success', metricsToInsert.length);
    log.info('Correlation computation complete', result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('Correlation job failed', { error: msg });
    await finishIngestionLog(ingestionLog.id, 'failed', 0, msg);
    result.failed++;
    result.errors.push(msg);
  }

  return result;
}
