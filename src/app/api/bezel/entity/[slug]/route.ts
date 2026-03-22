/**
 * GET /api/bezel/entity/[slug]
 *
 * Returns a BezelEntity record plus its most recent price snapshot and a
 * short sparkline history (last 7 days).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getBezelEntityBySlug, getLatestBezelPriceSnapshot } from '@/lib/db/queries';
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

    const entity = await getBezelEntityBySlug(slug);
    if (!entity) {
      return NextResponse.json(
        { error: `Bezel entity not found: ${slug}` },
        { status: 404 },
      );
    }

    const latest = await getLatestBezelPriceSnapshot(entity.id);

    // priceSnapshots from getBezelEntityBySlug is most recent 7 (desc order)
    // Reverse to chronological order for sparkline
    const sparkline = [...entity.priceSnapshots].reverse().map((s) => ({
      date: s.capturedAt.toISOString().slice(0, 10),
      price: s.price,
      change: s.dailyChange,
      changePct: s.dailyChangePct,
      quality: s.dataSourceQuality,
    }));

    return NextResponse.json(
      {
        data: {
          id: entity.id,
          slug: entity.slug,
          name: entity.name,
          brand: entity.brand,
          entityType: entity.entityType,
          referenceNumber: entity.referenceNumber,
          bezelUrl: entity.bezelUrl,
          discoveredEndpoint: entity.discoveredEndpoint,
          currentPrice: latest?.price ?? null,
          dailyChange: latest?.dailyChange ?? null,
          dailyChangePct: latest?.dailyChangePct ?? null,
          dataSourceQuality: latest?.dataSourceQuality ?? null,
          lastUpdated: latest?.capturedAt ?? null,
          sparkline,
        },
        meta: {
          timestamp: new Date().toISOString(),
          responseTimeMs: Date.now() - start,
        },
      },
      { headers: { 'Cache-Control': 'no-store', 'X-Response-Time': `${Date.now() - start}ms` } },
    );
  } catch (err) {
    logger.error(`GET /api/bezel/entity/${slug} failed`, { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
