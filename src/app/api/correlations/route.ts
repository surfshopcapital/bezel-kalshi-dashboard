/**
 * GET /api/correlations?lookback=30
 *
 * Returns a CorrelationMatrix built from the most recent CorrelationMetric
 * rows in the database, filtered by lookback window (days).
 *
 * The matrix is n×n where n = number of tracked BezelEntities.
 * Diagonal = 1.0, missing pairs = null (rendered as 0 in the heatmap).
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  getAllBezelEntities,
  getLatestCorrelationMetrics,
} from '@/lib/db/queries';
import { logger } from '@/lib/utils/logger';
import type { CorrelationMatrix } from '@/types';

export const dynamic = 'force-dynamic';

const VALID_LOOKBACKS = new Set([7, 14, 30, 60, 90]);

export async function GET(request: NextRequest) {
  const start = Date.now();

  try {
    const url = new URL(request.url);
    const raw = parseInt(url.searchParams.get('lookback') ?? '30', 10);
    const lookback = VALID_LOOKBACKS.has(raw) ? raw : 30;

    const [entities, metrics] = await Promise.all([
      getAllBezelEntities(),
      getLatestCorrelationMetrics(lookback),
    ]);

    const ids = entities.map((e) => e.id);
    const names = entities.map((e) => e.name);
    const n = ids.length;

    // Build n×n matrix: diagonal = 1, off-diagonal = null until filled
    const matrix: (number | null)[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 1 : null)),
    );

    const idIndex = new Map(ids.map((id, i) => [id, i]));

    for (const metric of metrics) {
      const i = idIndex.get(metric.entity1Id);
      const j = idIndex.get(metric.entity2Id);
      if (i !== undefined && j !== undefined) {
        matrix[i][j] = metric.correlation;
        matrix[j][i] = metric.correlation; // symmetric
      }
    }

    const computedAt =
      metrics[0]?.computedAt.toISOString() ?? new Date().toISOString();

    const result: CorrelationMatrix = { ids, names, matrix, computedAt };

    return NextResponse.json(
      {
        data: result,
        meta: {
          lookbackDays: lookback,
          entityCount: n,
          pairCount: metrics.length,
          timestamp: new Date().toISOString(),
          responseTimeMs: Date.now() - start,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    logger.error('GET /api/correlations failed', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
