/**
 * GET /api/jobs/backfill-bezel-history
 *
 * Fetch and persist historical Bezel price data for all tracked entities.
 * Designed to be triggered manually (one-time backfill) or via a cron.
 *
 * Query params:
 *   days  - Number of lookback days to fetch (default: 90, max: 365)
 *
 * Authentication:
 *   Requires `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
 */

import { NextRequest, NextResponse } from 'next/server';
import { bezelHistoryBackfillJob } from '@/lib/jobs/backfillBezelHistory';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — backfill may take longer than the 2-min default

export async function GET(request: NextRequest) {
  // Accept CRON_SECRET via Authorization header OR ?secret= query param
  if (process.env.CRON_SECRET) {
    const authHeader = request.headers.get('authorization');
    const querySecret = request.nextUrl.searchParams.get('secret');
    const authorized =
      authHeader === `Bearer ${process.env.CRON_SECRET}` ||
      querySecret === process.env.CRON_SECRET;
    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Parse optional `days` query param (default 90, capped at 365)
  const daysParam = request.nextUrl.searchParams.get('days');
  const days = Math.min(
    365,
    Math.max(1, daysParam ? parseInt(daysParam, 10) || 90 : 90),
  );

  const start = Date.now();
  logger.info('Bezel history backfill triggered via API', { days });

  try {
    const result = await bezelHistoryBackfillJob(days);
    logger.info('Bezel history backfill completed', result);

    return NextResponse.json({
      ok: true,
      data: result,
      meta: {
        days,
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Bezel history backfill failed', { error: msg });
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        meta: { days, durationMs: Date.now() - start },
      },
      { status: 500 },
    );
  }
}
