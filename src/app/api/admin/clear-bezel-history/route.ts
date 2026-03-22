/**
 * GET /api/admin/clear-bezel-history
 *
 * Deletes all BezelPriceSnapshot rows for a given entity slug so stale or
 * incorrect historical data can be purged before re-running backfill.
 *
 * Query params:
 *   slug=<entity-slug>  — required, e.g. "omega-speedmaster-moonwatch"
 *   secret=XXX          — required when CRON_SECRET env var is set
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Auth
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

  const slug = request.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json(
      { error: 'Missing required query param: slug' },
      { status: 400 },
    );
  }

  const entity = await prisma.bezelEntity.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!entity) {
    return NextResponse.json(
      { error: `No BezelEntity found for slug "${slug}"` },
      { status: 404 },
    );
  }

  const { count } = await prisma.bezelPriceSnapshot.deleteMany({
    where: { entityId: entity.id },
  });

  return NextResponse.json({
    ok: true,
    slug,
    deletedSnapshots: count,
    hint: 'Now re-run refresh-bezel and backfill-bezel-history to populate correct data',
  });
}
