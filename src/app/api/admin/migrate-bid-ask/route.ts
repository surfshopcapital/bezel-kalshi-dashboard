/**
 * GET /api/admin/migrate-bid-ask?secret=XXX
 *
 * One-time migration: adds yesBid and yesAsk nullable Float columns to
 * KalshiMarketSnapshot. Safe to run multiple times (uses IF NOT EXISTS).
 * Run once after deploying the schema change to Railway.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const param = request.nextUrl.searchParams.get('secret');
  if (param === secret) return true;
  const header = request.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Add yesBid column if it doesn't exist
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "KalshiMarketSnapshot" ADD COLUMN IF NOT EXISTS "yesBid" DOUBLE PRECISION;`,
    );

    // Add yesAsk column if it doesn't exist
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "KalshiMarketSnapshot" ADD COLUMN IF NOT EXISTS "yesAsk" DOUBLE PRECISION;`,
    );

    return NextResponse.json({
      ok: true,
      message: 'Migration applied: yesBid and yesAsk columns added to KalshiMarketSnapshot.',
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
