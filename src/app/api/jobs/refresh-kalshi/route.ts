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
  // Vercel cron authentication
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
