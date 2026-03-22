/**
 * GET /api/jobs/refresh-kalshi
 *
 * Trigger the Kalshi ingestion job manually or via Vercel Cron.
 * In production, protect this endpoint using the CRON_SECRET environment variable.
 */
import { NextRequest, NextResponse } from 'next/server';
import { refreshKalshiJob } from '@/lib/jobs/refreshKalshi';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

  const start = Date.now();
  logger.info('Kalshi refresh job triggered via API');

  try {
    const result = await refreshKalshiJob();
    logger.info('Kalshi refresh job completed', result);

    return NextResponse.json({
      ok: true,
      data: result,
      meta: { durationMs: Date.now() - start, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Kalshi refresh job failed', { error: msg });
    return NextResponse.json(
      { ok: false, error: msg, meta: { durationMs: Date.now() - start } },
      { status: 500 },
    );
  }
}
