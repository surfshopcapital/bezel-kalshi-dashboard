/**
 * GET /api/admin/cleanup-markets
 *
 * Lists (and optionally deletes) KalshiMarket rows whose ticker is NOT in
 * the current MARKET_MAPPINGS config. Stale rows appear as orphan cards on
 * the dashboard.
 *
 * Query params:
 *   delete=true   — actually delete the stale rows (default: dry-run only)
 *   secret=XXX    — required when CRON_SECRET env var is set
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { MARKET_MAPPINGS } from '@/lib/mappings';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Auth — same pattern as job routes
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

  const shouldDelete = request.nextUrl.searchParams.get('delete') === 'true';

  // Tickers that belong in the DB
  const activeTickers = new Set(MARKET_MAPPINGS.map((m) => m.kalshiTicker));

  // Find all KalshiMarket rows
  const allMarkets = await prisma.kalshiMarket.findMany({
    select: { id: true, ticker: true, title: true, status: true, updatedAt: true },
  });

  const stale = allMarkets.filter((m) => !activeTickers.has(m.ticker));
  const active = allMarkets.filter((m) => activeTickers.has(m.ticker));

  if (shouldDelete && stale.length > 0) {
    // Cascade: delete related snapshots, orderbook snaps, probability runs, mappings first
    const staleIds = stale.map((m) => m.id);

    await prisma.kalshiMarketSnapshot.deleteMany({ where: { marketId: { in: staleIds } } });
    await prisma.kalshiOrderbookSnapshot.deleteMany({ where: { marketId: { in: staleIds } } });
    await prisma.probabilityRun.deleteMany({ where: { marketId: { in: staleIds } } });
    await prisma.marketMapping.deleteMany({ where: { kalshiMarketId: { in: staleIds } } });
    await prisma.kalshiMarket.deleteMany({ where: { id: { in: staleIds } } });

    return NextResponse.json({
      ok: true,
      action: 'deleted',
      deletedCount: stale.length,
      deleted: stale.map((m) => m.ticker),
      remaining: active.map((m) => m.ticker),
    });
  }

  // Dry-run — just report
  return NextResponse.json({
    ok: true,
    action: 'dry_run',
    totalInDb: allMarkets.length,
    activeCount: active.length,
    staleCount: stale.length,
    stale: stale.map((m) => ({ ticker: m.ticker, title: m.title, updatedAt: m.updatedAt })),
    active: active.map((m) => m.ticker),
    hint: 'Add ?delete=true to actually remove the stale rows',
  });
}
