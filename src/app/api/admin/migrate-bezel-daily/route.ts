/**
 * GET /api/admin/migrate-bezel-daily
 *
 * One-time migration: adds bezelComputedAt and isNewDailyPrice columns to
 * BezelPriceSnapshot, then back-fills bezelComputedAt from rawPayload.timestamp
 * for all existing rows that have a timestamp in their payload.
 *
 * Safe to run multiple times — uses IF NOT EXISTS guards and skips rows already set.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Add columns (idempotent)
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "BezelPriceSnapshot"
        ADD COLUMN IF NOT EXISTS "bezelComputedAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "isNewDailyPrice" BOOLEAN NOT NULL DEFAULT FALSE
    `);

    // 2. Back-fill bezelComputedAt from rawPayload.timestamp for all existing rows
    //    that have a numeric timestamp and haven't been filled yet.
    const backfilled = await prisma.$executeRawUnsafe(`
      UPDATE "BezelPriceSnapshot"
      SET "bezelComputedAt" = to_timestamp(("rawPayload"->>'timestamp')::float)
      WHERE "bezelComputedAt" IS NULL
        AND "rawPayload" IS NOT NULL
        AND "rawPayload"->>'timestamp' IS NOT NULL
        AND ("rawPayload"->>'timestamp')::text ~ '^[0-9]+(\.[0-9]+)?$'
    `);

    // 3. Mark isNewDailyPrice = true for the first snapshot per entity per Bezel
    //    timestamp group (i.e. the earliest row that introduced each new daily price).
    //    Only operates on rows that don't already have isNewDailyPrice = true so it's safe to re-run.
    const flagged = await prisma.$executeRawUnsafe(`
      WITH ranked AS (
        SELECT
          id,
          "entityId",
          "bezelComputedAt",
          ROW_NUMBER() OVER (
            PARTITION BY "entityId", DATE("bezelComputedAt")
            ORDER BY "capturedAt" ASC
          ) AS rn
        FROM "BezelPriceSnapshot"
        WHERE "bezelComputedAt" IS NOT NULL
          AND "isNewDailyPrice" = FALSE
      )
      UPDATE "BezelPriceSnapshot"
      SET "isNewDailyPrice" = TRUE
      FROM ranked
      WHERE "BezelPriceSnapshot".id = ranked.id
        AND ranked.rn = 1
    `);

    return NextResponse.json({
      ok: true,
      message: 'Migration applied: bezelComputedAt and isNewDailyPrice columns added.',
      backfilledRows: backfilled,
      flaggedRows: flagged,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Migration failed', details: String(err) },
      { status: 500 },
    );
  }
}
