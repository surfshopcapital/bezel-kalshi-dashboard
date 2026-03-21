import { NextRequest, NextResponse } from 'next/server';
import { getAllKalshiMarkets } from '@/lib/db/queries';
import { logger } from '@/lib/utils/logger';

export async function GET(request: NextRequest) {
  const start = Date.now();
  try {
    const markets = await getAllKalshiMarkets();
    return NextResponse.json(
      {
        data: markets,
        meta: {
          count: markets.length,
          timestamp: new Date().toISOString(),
          responseTimeMs: Date.now() - start,
        },
      },
      {
        headers: { 'X-Response-Time': `${Date.now() - start}ms` },
      },
    );
  } catch (err) {
    logger.error('GET /api/kalshi/markets failed', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
