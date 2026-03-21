/**
 * Fetch and persist latest Bezel price data for all tracked entities.
 *
 * Iterates unique Bezel slugs from MARKET_MAPPINGS, fetches the latest
 * price via the Bezel provider, upserts the BezelEntity row, and appends
 * a BezelPriceSnapshot. Records ingestion logs for audit purposes.
 */
import { fetchEntityPrice } from '@/lib/bezel/provider';
import {
  upsertBezelEntity,
  appendBezelPriceSnapshot,
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

  log.info('Starting Bezel ingestion', { slugCount: uniqueSlugs.length });

  for (const slug of uniqueSlugs) {
    // Find the canonical mapping for this slug (take the first one)
    const mapping = MARKET_MAPPINGS.find((m) => m.bezelSlug === slug);
    if (!mapping) {
      log.warn('No mapping found for slug', { slug });
      result.skipped++;
      continue;
    }

    const ingestionLog = await startIngestionLog('refreshBezel', 'bezel_provider', undefined, slug);

    try {
      log.info('Fetching Bezel entity', { slug });

      const ingestionResult = await fetchEntityPrice(slug);

      if (!ingestionResult.success || !ingestionResult.price) {
        const errorMsg = ingestionResult.error ?? `No price data returned for ${slug}`;
        log.warn('Bezel fetch returned no price', { slug, error: errorMsg });

        // Still upsert the entity so the mapping works, but with a null price
        const entity = await upsertBezelEntity({
          slug,
          entityType: mapping.bezelEntityType,
          name: slug,
          brand: mapping.brand,
          referenceNumber: mapping.referenceNumber ?? null,
          bezelUrl: mapping.bezelUrl,
        });

        // Record a manual_mapping_fallback snapshot so the entity exists
        await appendBezelPriceSnapshot(entity.id, {
          slug,
          entityType: mapping.bezelEntityType,
          name: slug,
          price: 0,
          dailyChange: null,
          dailyChangePct: null,
          volume: null,
          capturedAt: new Date().toISOString(),
          dataSourceQuality: 'manual_mapping_fallback',
          rawPayload: { error: errorMsg },
        });

        await finishIngestionLog(ingestionLog.id, 'partial', 1, errorMsg);
        result.failed++;
        result.errors.push(`${slug}: ${errorMsg}`);
        continue;
      }

      const normalized = ingestionResult.price;

      // Upsert the BezelEntity record
      const entity = await upsertBezelEntity({
        slug,
        entityType: normalized.entityType,
        name: normalized.name,
        brand: mapping.brand,
        referenceNumber: mapping.referenceNumber ?? null,
        bezelUrl: mapping.bezelUrl,
      });

      // Append the price snapshot
      await appendBezelPriceSnapshot(entity.id, normalized);

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
