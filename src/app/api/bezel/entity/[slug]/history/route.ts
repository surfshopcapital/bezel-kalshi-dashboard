/**
 * GET /api/bezel/entity/[slug]/history?limit=90
 *
 * Returns historical BezelPriceSnapshot data for a given entity slug,
 * formatted as BezelPricePoint[] ordered oldest→newest for chart rendering.
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
    const limit = Math.min(
      500,
      Math.max(1, parseInt(url.searchParams.get('limit') ?? '90', 10) || 90),
    );

    const history = await getBezelPriceHistory(slug, limit);

    const points = history.map((h) => ({
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
