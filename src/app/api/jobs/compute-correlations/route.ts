/**
 * GET /api/jobs/compute-correlations
 *
 * Trigger the correlation computation job manually or via Vercel Cron.
 */
import { NextRequest, NextResponse } from 'next/server';
import { computeCorrelationsJob } from '@/lib/jobs/computeCorrelations';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  logger.info('Correlation computation job triggered via API');

  try {
    const result = await computeCorrelationsJob();
    logger.info('Correlation computation job completed', result);

    return NextResponse.json({
      ok: true,
      data: result,
      meta: { durationMs: Date.now() - start, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Correlation computation job failed', { error: msg });
    return NextResponse.json(
      { ok: false, error: msg, meta: { durationMs: Date.now() - start } },
      { status: 500 },
    );
  }
}
