/**
 * Backfill historical Bezel price data for all tracked entities.
 *
 * For each entity in MARKET_MAPPINGS that has a `bezelHistoryApiUrl`, fetches
 * the specified date range from the Bezel time-series API and inserts one
 * BezelPriceSnapshot per data point. Duplicate data points (within ±6 h of an
 * existing snapshot) are silently skipped, so the job is safe to re-run.
 *
 * Bezel history endpoint shape:
 *   GET /beztimate/indexes/{id}/data?start=ISO8601&end=ISO8601
 *   GET /beztimate/composites/{id}/data?modelId=...&...&start=ISO8601&end=ISO8601
 *   Response: Array<{ timestamp: number; valueCents: number }>
 */

import {
  upsertBezelEntity,
  insertBezelPriceSnapshotAtTime,
  startIngestionLog,
  finishIngestionLog,
} from '@/lib/db/queries';
import { MARKET_MAPPINGS, getUniqueBezelSlugs } from '@/lib/mappings';
import { createChildLogger } from '@/lib/utils/logger';

const log = createChildLogger({ job: 'backfillBezelHistory' });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BezelHistoryPoint {
  timestamp: number; // Unix seconds (float)
  valueCents: number; // Integer cents
}

export interface BackfillResult {
  slug: string;
  inserted: number;
  skipped: number;
  error?: string;
}

export interface BezelHistoryBackfillResult {
  success: number;
  failed: number;
  totalInserted: number;
  totalSkipped: number;
  results: BackfillResult[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the full history URL for an entity, appending the ISO 8601 start/end
 * params. Handles both "clean" base URLs and ones that already contain a `?`.
 */
function buildHistoryUrl(baseUrl: string, start: Date, end: Date): string {
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`;
}

/**
 * Fetch and parse the history array from the Bezel API.
 * Returns an empty array on any failure (network error, bad status, bad shape).
 */
async function fetchBezelHistory(
  url: string,
  slug: string,
): Promise<BezelHistoryPoint[]> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'BezelKalshiDashboard/1.0',
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      log.warn('Bezel history API returned non-OK status', {
        slug,
        url,
        status: response.status,
      });
      return [];
    }

    const raw = await response.json();

    // The API returns a plain JSON array of { timestamp, valueCents }
    if (!Array.isArray(raw)) {
      log.warn('Bezel history API returned non-array body', { slug, url, type: typeof raw });
      return [];
    }

    const points: BezelHistoryPoint[] = [];
    for (const item of raw) {
      if (
        item !== null &&
        typeof item === 'object' &&
        typeof item.timestamp === 'number' &&
        typeof item.valueCents === 'number' &&
        item.valueCents > 0
      ) {
        points.push({ timestamp: item.timestamp, valueCents: item.valueCents });
      }
    }

    return points;
  } catch (err) {
    log.warn('Failed to fetch Bezel history', {
      slug,
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public job function
// ---------------------------------------------------------------------------

/**
 * Backfill Bezel price history for all tracked entities.
 *
 * @param lookbackDays - How many days of history to fetch (default: 90)
 */
export async function bezelHistoryBackfillJob(
  lookbackDays = 90,
): Promise<BezelHistoryBackfillResult> {
  const result: BezelHistoryBackfillResult = {
    success: 0,
    failed: 0,
    totalInserted: 0,
    totalSkipped: 0,
    results: [],
  };

  const end = new Date();
  const start = new Date(end.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  log.info('Starting Bezel history backfill', {
    lookbackDays,
    start: start.toISOString(),
    end: end.toISOString(),
  });

  const uniqueSlugs = getUniqueBezelSlugs();

  for (const slug of uniqueSlugs) {
    const mapping = MARKET_MAPPINGS.find((m) => m.bezelSlug === slug);
    if (!mapping) {
      log.warn('No mapping found for slug', { slug });
      continue;
    }

    if (!mapping.bezelHistoryApiUrl) {
      log.info('No history API URL configured for slug — skipping', { slug });
      continue;
    }

    const ingestionLog = await startIngestionLog(
      'backfillBezelHistory',
      'bezel_history_api',
      undefined,
      slug,
    );

    const slugResult: BackfillResult = { slug, inserted: 0, skipped: 0 };

    try {
      // Ensure the BezelEntity row exists before we try to link snapshots to it
      const entity = await upsertBezelEntity({
        slug,
        entityType: mapping.bezelEntityType,
        name: slug, // will be overwritten by next refresh run
        brand: mapping.brand,
        referenceNumber: mapping.referenceNumber ?? null,
        bezelUrl: mapping.bezelUrl,
      });

      const historyUrl = buildHistoryUrl(mapping.bezelHistoryApiUrl, start, end);
      log.info('Fetching Bezel history', { slug, url: historyUrl });

      const points = await fetchBezelHistory(historyUrl, slug);

      if (points.length === 0) {
        const msg = `No history data returned for ${slug}`;
        log.warn(msg, { slug, url: historyUrl });
        await finishIngestionLog(ingestionLog.id, 'partial', 0, msg);
        slugResult.error = msg;
        result.failed++;
        result.results.push(slugResult);
        continue;
      }

      log.info('Received history points', { slug, count: points.length });

      for (const point of points) {
        const capturedAt = new Date(point.timestamp * 1000); // seconds → ms
        const price = point.valueCents / 100; // cents → dollars

        const inserted = await insertBezelPriceSnapshotAtTime(
          entity.id,
          capturedAt,
          {
            price,
            dailyChange: null,
            dailyChangePct: null,
            volume: null,
            dataSourceQuality: 'official_api',
            rawPayload: { timestamp: point.timestamp, valueCents: point.valueCents },
          },
        );

        if (inserted) {
          slugResult.inserted++;
        } else {
          slugResult.skipped++;
        }
      }

      await finishIngestionLog(
        ingestionLog.id,
        'success',
        slugResult.inserted,
      );

      log.info('Bezel history backfill complete for slug', {
        slug,
        inserted: slugResult.inserted,
        skipped: slugResult.skipped,
      });

      result.success++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('Failed to backfill Bezel history for slug', { slug, error: msg });
      await finishIngestionLog(ingestionLog.id, 'failed', 0, msg);
      slugResult.error = msg;
      result.failed++;
    }

    result.totalInserted += slugResult.inserted;
    result.totalSkipped += slugResult.skipped;
    result.results.push(slugResult);
  }

  log.info('Bezel history backfill finished', {
    success: result.success,
    failed: result.failed,
    totalInserted: result.totalInserted,
    totalSkipped: result.totalSkipped,
  });

  return result;
}
