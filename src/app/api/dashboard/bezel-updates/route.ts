/**
 * GET /api/dashboard/bezel-updates
 *
 * Returns the most recent "new daily price" snapshot timestamp for each
 * tracked Bezel entity. This tells the dashboard exactly when Bezel last
 * published a fresh price for each market.
 */
import { NextResponse } from 'next/server';
import { getBezelUpdateLog } from '@/lib/db/queries';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const log = await getBezelUpdateLog();

    return NextResponse.json(
      {
        data: log.map((row) => ({
          slug: row.slug,
          name: row.name,
          price: row.price,
          dailyChange: row.dailyChange,
          dailyChangePct: row.dailyChangePct,
          bezelComputedAt: row.bezelComputedAt?.toISOString() ?? null,
          capturedAt: row.capturedAt?.toISOString() ?? null,
        })),
        meta: { timestamp: new Date().toISOString() },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    logger.error('GET /api/dashboard/bezel-updates failed', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
