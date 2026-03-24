/**
 * GET /api/admin/run-backfill?secret=XXX&days=90
 *
 * Triggers the Bezel historical price backfill for all tracked entities.
 * Fetches up to `days` (default 90) days of daily history from the Bezel API
 * and inserts any missing BezelPriceSnapshot rows.
 *
 * Safe to run multiple times — the underlying job deduplicates within ±6 h of
 * any existing snapshot, so re-running never creates duplicate rows.
 *
 * This endpoint MUST be run after initial setup (or if historical data is
 * missing) to populate the price history used by the probability model.
 */
import { NextRequest, NextResponse } from 'next/server';
import { bezelHistoryBackfillJob } from '@/lib/jobs/backfillBezelHistory';

export const dynamic = 'force-dynamic';
// Backfill can take a while for all 8 entities over 90 days
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const daysParam = request.nextUrl.searchParams.get('days');
  const lookbackDays = daysParam
    ? Math.min(365, Math.max(1, parseInt(daysParam, 10) || 90))
    : 90;

  try {
    const result = await bezelHistoryBackfillJob(lookbackDays);

    return NextResponse.json({
      ok: true,
      lookbackDays,
      result,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
