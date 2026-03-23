/**
 * POST /api/admin/migrate-bezel-update-cols
 *
 * Adds bezelComputedAt (TIMESTAMP) and isNewDailyPrice (BOOLEAN) columns to
 * BezelPriceSnapshot. Safe to run multiple times — both statements use
 * IF NOT EXISTS guards.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "BezelPriceSnapshot"
      ADD COLUMN IF NOT EXISTS "bezelComputedAt" TIMESTAMP(3);
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "BezelPriceSnapshot"
      ADD COLUMN IF NOT EXISTS "isNewDailyPrice" BOOLEAN NOT NULL DEFAULT false;
    `);

    // Add index for efficient daily-update queries
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "BezelPriceSnapshot_entityId_isNewDailyPrice_idx"
      ON "BezelPriceSnapshot" ("entityId", "isNewDailyPrice");
    `);

    return NextResponse.json({
      ok: true,
      message: 'Migration applied: bezelComputedAt and isNewDailyPrice columns added to BezelPriceSnapshot.',
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
