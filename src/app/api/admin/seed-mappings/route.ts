/**
 * GET /api/admin/seed-mappings
 *
 * Idempotent: creates (or updates) MarketMapping rows linking KalshiMarket ↔
 * BezelEntity for every entry in MARKET_MAPPINGS.
 *
 * Run this once after adding new markets to MARKET_MAPPINGS and after running
 * refresh-kalshi (so KalshiMarket rows exist) and refresh-bezel (so
 * BezelEntity rows exist).
 *
 * Query params:
 *   secret=XXX  — required when CRON_SECRET env var is set
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { MARKET_MAPPINGS } from '@/lib/mappings';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Auth — same pattern as other admin routes
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

  const results: { ticker: string; slug: string; status: string }[] = [];
  const errors: string[] = [];

  for (const m of MARKET_MAPPINGS) {
    try {
      // Find the KalshiMarket row (created by refresh-kalshi)
      const kalshiMarket = await prisma.kalshiMarket.findUnique({
        where: { ticker: m.kalshiTicker },
        select: { id: true },
      });
      if (!kalshiMarket) {
        errors.push(`${m.kalshiTicker}: KalshiMarket row not found — run refresh-kalshi first`);
        continue;
      }

      // Find the BezelEntity row (created by refresh-bezel)
      const bezelEntity = await prisma.bezelEntity.findUnique({
        where: { slug: m.bezelSlug },
        select: { id: true },
      });
      if (!bezelEntity) {
        errors.push(
          `${m.kalshiTicker}: BezelEntity not found for slug "${m.bezelSlug}" — run refresh-bezel first`,
        );
        continue;
      }

      // Upsert the MarketMapping linking both
      await prisma.marketMapping.upsert({
        where: { kalshiTicker: m.kalshiTicker },
        create: {
          kalshiTicker: m.kalshiTicker,
          kalshiMarketId: kalshiMarket.id,
          bezelEntityId: bezelEntity.id,
          strikeValue: m.strikeValue,
          strikeDirection: m.strikeDirection,
          strikeParsedFrom: 'config',
          notes: m.notes ?? null,
        },
        update: {
          kalshiMarketId: kalshiMarket.id,
          bezelEntityId: bezelEntity.id,
          strikeValue: m.strikeValue,
          strikeDirection: m.strikeDirection,
          strikeParsedFrom: 'config',
          notes: m.notes ?? null,
        },
      });

      results.push({ ticker: m.kalshiTicker, slug: m.bezelSlug, status: 'ok' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${m.kalshiTicker}: ${msg}`);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    seeded: results.length,
    failed: errors.length,
    results,
    errors,
  });
}
