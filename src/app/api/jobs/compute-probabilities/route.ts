/**
 * GET /api/jobs/compute-probabilities
 *
 * Trigger the probability computation job manually or via Vercel Cron.
 */
import { NextRequest, NextResponse } from 'next/server';
import { computeProbabilitiesJob } from '@/lib/jobs/computeProbabilities';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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
  logger.info('Probability computation job triggered via API');

  try {
    const result = await computeProbabilitiesJob();
    logger.info('Probability computation job completed', result);

    return NextResponse.json({
      ok: true,
      data: result,
      meta: { durationMs: Date.now() - start, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Probability computation job failed', { error: msg });
    return NextResponse.json(
      { ok: false, error: msg, meta: { durationMs: Date.now() - start } },
      { status: 500 },
    );
  }
}
