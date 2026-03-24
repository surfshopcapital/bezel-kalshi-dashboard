/**
 * GET /api/bezel/entity/[slug]/history?limit=90
 *
 * Returns historical BezelPriceSnapshot data for a given entity slug,
 * formatted as BezelPricePoint[] ordered oldest→newest for chart rendering.
 *
 * `limit` controls the number of DAILY prices returned (not raw snapshots).
 * Bezel publishes one price per day; polling every 15 minutes creates many
 * duplicate snapshots. We over-fetch raw rows and deduplicate to the LAST
 * snapshot per calendar day so the chart shows the post-update price rather
 * than the stale pre-update value from earlier in the day.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getBezelPriceHistory } from '@/lib/db/queries';
import { logger } from '@/lib/utils/logger';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const start = Date.now();

  try {
    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 });
    }

    const url = new URL(request.url);
    // `limit` = number of DAILY price points to return.
    // Over-fetch raw rows (×200) to cover 15-min polling (96 rows/day), then
    // deduplicate to the last (most recent) snapshot per calendar day.
    const limit = Math.min(
      500,
      Math.max(1, parseInt(url.searchParams.get('limit') ?? '90', 10) || 90),
    );
    const rawLimit = Math.min(20_000, limit * 200);

    const rawHistory = await getBezelPriceHistory(slug, rawLimit);

    // Keep the LAST (most recent) snapshot per calendar day.
    // rawHistory is oldest→newest; iterating forward and overwriting the Map
    // entry means the final value per date key is always the most recent
    // intraday snapshot — capturing the Bezel daily update rather than the
    // stale pre-update price from earlier in the day.
    const dayMap = new Map<string, typeof rawHistory[0]>();
    for (const h of rawHistory) {
      dayMap.set(h.capturedAt.toISOString().slice(0, 10), h); // last write wins
    }
    const dailyHistory = Array.from(dayMap.values()); // already oldest→newest

    // Return the most recent `limit` daily prices
    const sliced = dailyHistory.slice(-limit);

    const points = sliced.map((h) => ({
      date: h.capturedAt.toISOString().slice(0, 10),
      price: h.price,
      change: h.dailyChange,
      changePct: h.dailyChangePct,
      quality: h.dataSourceQuality,
    }));

    return NextResponse.json(
      {
        data: points,
        meta: {
          slug,
          count: points.length,
          timestamp: new Date().toISOString(),
          responseTimeMs: Date.now() - start,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    logger.error(`GET /api/bezel/entity/${slug}/history failed`, {
      error: String(err),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
