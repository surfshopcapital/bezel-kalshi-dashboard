/**
 * Fetch and persist latest Bezel price data for all tracked entities.
 *
 * Iterates unique Bezel slugs from MARKET_MAPPINGS, fetches the latest
 * price via the Bezel provider, upserts the BezelEntity row, and appends
 * a BezelPriceSnapshot. Records ingestion logs for audit purposes.
 */
import { bezelProvider } from '@/lib/bezel/provider';
import {
  upsertBezelEntity,
  appendBezelPriceSnapshot,
  getLatestBezelPriceSnapshot,
  startIngestionLog,
  finishIngestionLog,
} from '@/lib/db/queries';
import { MARKET_MAPPINGS, getUniqueBezelSlugs } from '@/lib/mappings';
import { createChildLogger } from '@/lib/utils/logger';

const log = createChildLogger({ job: 'refreshBezel' });

export interface BezelRefreshResult {
  success: number;
  failed: number;
  skipped: number;
  errors: string[];
}

export async function bezelIngestionJob(): Promise<BezelRefreshResult> {
  const result: BezelRefreshResult = { success: 0, failed: 0, skipped: 0, errors: [] };
  const uniqueSlugs = getUniqueBezelSlugs();

  // Pre-seed the provider cache with all known API endpoints so Tier 1
  // (direct HTTP fetch, no Playwright) succeeds immediately on the first run.
  for (const mapping of MARKET_MAPPINGS) {
    if (mapping.bezelApiUrl) {
      bezelProvider.preloadEndpoint(mapping.bezelSlug, mapping.bezelApiUrl);
      log.info('Pre-seeded Bezel endpoint', { slug: mapping.bezelSlug, url: mapping.bezelApiUrl });
    }
  }

  log.info('Starting Bezel ingestion', { slugCount: uniqueSlugs.length });

  for (const slug of uniqueSlugs) {
    // Find the canonical mapping config for this slug (take the first one)
    const mapping = MARKET_MAPPINGS.find((m) => m.bezelSlug === slug);
    if (!mapping) {
      log.warn('No mapping found for slug', { slug });
      result.skipped++;
      continue;
    }

    const ingestionLog = await startIngestionLog(
      'refreshBezel',
      'bezel_provider',
      undefined,
      slug,
    );

    try {
      log.info('Fetching Bezel entity', { slug, entityType: mapping.bezelEntityType });

      const ingestionResult = await bezelProvider.fetchEntityPrice(
        slug,
        mapping.bezelEntityType,
        mapping.bezelUrl,
      );

      // Always upsert the entity record so the mapping row can reference it
      const entity = await upsertBezelEntity({
        slug,
        entityType: mapping.bezelEntityType,
        name: ingestionResult.price?.name ?? slug,
        brand: mapping.brand,
        referenceNumber: mapping.referenceNumber ?? null,
        bezelUrl: mapping.bezelUrl,
      });

      if (!ingestionResult.success || !ingestionResult.price) {
        const errorMsg = ingestionResult.error ?? `No price data returned for ${slug}`;
        log.warn('Bezel fetch returned no price', { slug, error: errorMsg });

        // Append a null-price fallback snapshot so the entity has a row
        await appendBezelPriceSnapshot(entity.id, {
          price: 0,
          dailyChange: null,
          dailyChangePct: null,
          volume: null,
          dataSourceQuality: 'manual_mapping_fallback',
          rawPayload: { error: errorMsg },
        });

        await finishIngestionLog(ingestionLog.id, 'partial', 1, errorMsg);
        result.failed++;
        result.errors.push(`${slug}: ${errorMsg}`);
        continue;
      }

      const normalized = ingestionResult.price;

      // ── Daily-update detection ────────────────────────────────────────────
      // Compare the Bezel-side timestamp in the new payload against the most
      // recently stored snapshot. If it differs, Bezel pushed a new daily price.
      const latestStored = await getLatestBezelPriceSnapshot(entity.id);
      const prevRaw = latestStored?.rawPayload as Record<string, unknown> | null | undefined;
      const newRaw  = normalized.rawPayload as Record<string, unknown> | null | undefined;
      const prevBezelTs = typeof prevRaw?.timestamp === 'number' ? prevRaw.timestamp : null;
      const newBezelTs  = typeof newRaw?.timestamp  === 'number' ? newRaw.timestamp  : null;

      // bezelComputedAt: when Bezel actually computed this price
      const bezelComputedAt = newBezelTs != null ? new Date(newBezelTs * 1000) : null;

      // Flag as new daily price if Bezel's timestamp advanced (or this is the first snapshot)
      const isNewDailyPrice = newBezelTs != null && newBezelTs !== prevBezelTs;

      if (isNewDailyPrice) {
        log.info('New Bezel daily price detected', {
          slug,
          bezelComputedAt: bezelComputedAt?.toISOString(),
          prevTs: prevBezelTs,
          newTs: newBezelTs,
        });
      }

      // Append the price snapshot
      await appendBezelPriceSnapshot(entity.id, {
        price: normalized.price,
        dailyChange: normalized.dailyChange,
        dailyChangePct: normalized.dailyChangePct,
        volume: normalized.volume,
        dataSourceQuality: normalized.dataSourceQuality,
        rawPayload: normalized.rawPayload as object,
        bezelComputedAt,
        isNewDailyPrice,
      });

      await finishIngestionLog(ingestionLog.id, 'success', 1);
      result.success++;

      log.info('Bezel entity refreshed OK', {
        slug,
        price: normalized.price,
        quality: normalized.dataSourceQuality,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('Failed to refresh Bezel entity', { slug, error: msg });
      await finishIngestionLog(ingestionLog.id, 'failed', 0, msg);
      result.failed++;
      result.errors.push(`${slug}: ${msg}`);
    }
  }

  log.info('Bezel ingestion complete', result);
  return result;
}
